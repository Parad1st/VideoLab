import os
import json
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters
)
import config

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Глобальные переменные для хранения состояния пользователей
user_states = {}  # {user_id: 'state'}
user_data_storage = {}  # {user_id: {'category': ..., 'file': ..., 'caption': ...}}

# Категории для предложения вещей
CATEGORIES = {
    'video': 'Видео',
    'audio': 'Аудио',
    'images': 'Картинки',
    'fonts': 'Шрифты'
}

# Загрузка состояния из файла
def load_state():
    """Загружает состояние приёма предложений из файла"""
    try:
        if os.path.exists(config.STATE_FILE):
            with open(config.STATE_FILE, 'r', encoding='utf-8') as f:
                state = json.load(f)
                config.ACCEPTING_SUGGESTIONS = state.get('accepting_suggestions', True)
                if state.get('admin_id'):
                    config.ADMIN_ID = state['admin_id']
    except Exception as e:
        logger.error(f"Ошибка загрузки состояния: {e}")

# Сохранение состояния в файл
def save_state():
    """Сохраняет состояние приёма предложений в файл"""
    try:
        state = {
            'accepting_suggestions': config.ACCEPTING_SUGGESTIONS,
            'admin_id': config.ADMIN_ID
        }
        os.makedirs(os.path.dirname(config.STATE_FILE), exist_ok=True)
        with open(config.STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Ошибка сохранения состояния: {e}")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start"""
    user = update.effective_user
    user_id = user.id
    username = user.username or ""
    
    # Сохраняем ID админа если это он
    if username == config.ADMIN_USERNAME or user.username == config.ADMIN_USERNAME:
        config.ADMIN_ID = user_id
        save_state()  # Сохраняем ID админа
        await update.message.reply_text(
            f"Добро пожаловать, админ {user.first_name}! 👑\n\n"
            "У вас есть доступ к панели управления.",
            reply_markup=get_admin_keyboard()
        )
        return
    
    # Обычный пользователь
    await update.message.reply_text(
        f"Привет, {user.first_name}! 👋\n\n"
        "Добро пожаловать в VideoLab бот!\n"
        "Выберите действие:",
        reply_markup=get_main_keyboard()
    )


def get_main_keyboard():
    """Клавиатура для обычных пользователей"""
    keyboard = [
        [InlineKeyboardButton("📦 Предложить вещь в пак", callback_data='suggest_item')],
        [InlineKeyboardButton("🐛 Сообщить об ошибке", callback_data='report_bug')],
        [InlineKeyboardButton("🌐 Перейти на сайт", url=config.WEBSITE_URL)]
    ]
    return InlineKeyboardMarkup(keyboard)


def get_admin_keyboard():
    """Клавиатура для админа"""
    status = "✅ Открыт" if config.ACCEPTING_SUGGESTIONS else "❌ Закрыт"
    keyboard = [
        [InlineKeyboardButton(f"📦 Приём предложений: {status}", callback_data='toggle_suggestions')],
        [InlineKeyboardButton("📊 Статистика", callback_data='admin_stats')],
        [InlineKeyboardButton("🌐 Перейти на сайт", url=config.WEBSITE_URL)]
    ]
    return InlineKeyboardMarkup(keyboard)


def get_category_keyboard():
    """Клавиатура выбора категории"""
    keyboard = [
        [InlineKeyboardButton(CATEGORIES['video'], callback_data=f'category_video')],
        [InlineKeyboardButton(CATEGORIES['audio'], callback_data=f'category_audio')],
        [InlineKeyboardButton(CATEGORIES['images'], callback_data=f'category_images')],
        [InlineKeyboardButton(CATEGORIES['fonts'], callback_data=f'category_fonts')],
        [InlineKeyboardButton("❌ Отмена", callback_data='cancel')]
    ]
    return InlineKeyboardMarkup(keyboard)


async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик нажатий на кнопки"""
    query = update.callback_query
    await query.answer()
    user_id = query.from_user.id
    data = query.data
    
    # Админ панель
    if data == 'toggle_suggestions':
        if user_id == config.ADMIN_ID:
            config.ACCEPTING_SUGGESTIONS = not config.ACCEPTING_SUGGESTIONS
            save_state()  # Сохраняем изменение
            status = "✅ открыт" if config.ACCEPTING_SUGGESTIONS else "❌ закрыт"
            await query.edit_message_text(
                f"Приём предложений теперь {status}.",
                reply_markup=get_admin_keyboard()
            )
        return
    
    if data == 'admin_stats':
        if user_id == config.ADMIN_ID:
            await query.edit_message_text(
                "📊 Статистика:\n\n"
                f"Приём предложений: {'✅ Открыт' if config.ACCEPTING_SUGGESTIONS else '❌ Закрыт'}\n"
                f"Пользователей в очереди: {len(user_data_storage)}",
                reply_markup=get_admin_keyboard()
            )
        return
    
    # Предложить вещь
    if data == 'suggest_item':
        if not config.ACCEPTING_SUGGESTIONS:
            await query.edit_message_text(
                "К сожалению сообщений и так много, и я просто не успеваю. Пожалуйста отправьте позже. Спасибо за понимание",
                reply_markup=get_main_keyboard()
            )
            return
        
        user_states[user_id] = 'choosing_category'
        await query.edit_message_text(
            "Выберите категорию:",
            reply_markup=get_category_keyboard()
        )
        return
    
    # Выбор категории
    if data.startswith('category_'):
        category = data.split('_')[1]
        user_states[user_id] = f'waiting_file_{category}'
        user_data_storage[user_id] = {'category': category}
        
        # Отправляем видеоинструкцию если она есть
        instruction_path = os.path.join(config.INSTRUCTIONS_PATH, f"{category}.mp4")
        if os.path.exists(instruction_path):
            try:
                with open(instruction_path, 'rb') as video:
                    await query.message.reply_video(
                        video=video,
                        caption="📹 Видеоинструкция:"
                    )
            except Exception as e:
                logger.error(f"Ошибка отправки видеоинструкции: {e}")
        
        await query.edit_message_text(
            "Внимание! Отправляйте вещь без сжатия и выбирайте категорию правильно. "
            "Также введите правдивое название чтобы мне было проще. По желанию напишите описание.\n\n"
            f"Выбрана категория: {CATEGORIES[category]}\n\n"
            "Отправьте файл:"
        )
        return
    
    # Сообщить об ошибке
    if data == 'report_bug':
        user_states[user_id] = 'reporting_bug'
        await query.edit_message_text(
            "🐛 Сообщить об ошибке\n\n"
            "Опишите проблему и при необходимости приложите скриншот:"
        )
        return
    
    # Отмена
    if data == 'cancel':
        if user_id in user_states:
            del user_states[user_id]
        if user_id in user_data_storage:
            del user_data_storage[user_id]
        await query.edit_message_text(
            "Операция отменена.",
            reply_markup=get_main_keyboard()
        )
        return


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик текстовых сообщений и файлов"""
    user_id = update.effective_user.id
    message = update.message
    
    # Проверяем, что админ установлен (если это не /start)
    if not config.ADMIN_ID and message.text and message.text.startswith('/start'):
        await start(update, context)
        return
    
    if not config.ADMIN_ID:
        await message.reply_text("Бот временно недоступен. Попробуйте позже.")
        return
    
    # Админ команды
    if user_id == config.ADMIN_ID and message.text:
        if message.text.startswith('/admin'):
            await message.reply_text(
                "Панель администратора:",
                reply_markup=get_admin_keyboard()
            )
            return
    
    # Обработка состояния пользователя
    state = user_states.get(user_id)
    
    # Сообщение об ошибке
    if state == 'reporting_bug':
        bug_text = message.text or "Сообщение об ошибке"
        user_info = f"@{update.effective_user.username}" if update.effective_user.username else update.effective_user.first_name
        
        # Проверяем наличие фото
        if message.photo:
            photo = message.photo[-1]
            try:
                await context.bot.send_message(
                    chat_id=config.ADMIN_ID,
                    text=f"🐛 Сообщение об ошибке от {user_info}:\n\n{bug_text}"
                )
                await context.bot.send_photo(
                    chat_id=config.ADMIN_ID,
                    photo=photo.file_id,
                    caption="Скриншот"
                )
            except Exception as e:
                logger.error(f"Ошибка отправки сообщения об ошибке админу: {e}")
        else:
            try:
                await context.bot.send_message(
                    chat_id=config.ADMIN_ID,
                    text=f"🐛 Сообщение об ошибке от {user_info}:\n\n{bug_text}"
                )
            except Exception as e:
                logger.error(f"Ошибка отправки сообщения об ошибке админу: {e}")
        
        user_states[user_id] = None
        await message.reply_text(
            "Спасибо за сообщение! Мы обязательно проверим и исправим ошибку.",
            reply_markup=get_main_keyboard()
        )
        return
    
    # Ожидание файла для предложения
    if state and state.startswith('waiting_file_'):
        category = state.split('_')[-1]
        
        # Получаем файл
        file_obj = None
        file_type = None
        
        if message.video:
            file_obj = message.video
            file_type = 'video'
        elif message.audio:
            file_obj = message.audio
            file_type = 'audio'
        elif message.document:
            file_obj = message.document
            file_type = 'document'
        elif message.photo:
            file_obj = message.photo[-1]
            file_type = 'photo'
        
        if file_obj:
            # Сохраняем информацию о файле
            if user_id not in user_data_storage:
                user_data_storage[user_id] = {'category': category}
            user_data_storage[user_id]['file'] = {
                'file_id': file_obj.file_id,
                'file_name': getattr(file_obj, 'file_name', None),
                'file_type': file_type
            }
            
            # Проверяем наличие текста (название и описание)
            caption = message.caption or ""
            if caption:
                user_data_storage[user_id]['caption'] = caption
                await send_suggestion_to_admin(update, context, user_id, category)
                if user_id in user_data_storage:
                    del user_data_storage[user_id]
                if user_id in user_states:
                    user_states[user_id] = None
                await message.reply_text(
                    "Спасибо за помощь! Ваше предложение отправлено.",
                    reply_markup=get_main_keyboard()
                )
            else:
                user_states[user_id] = 'waiting_caption'
                await message.reply_text(
                    "Пожалуйста, напишите название и описание (по желанию):"
                )
            return
    
    # Ожидание названия и описания
    if state == 'waiting_caption':
        if message.text:
            category = user_data_storage[user_id].get('category', 'unknown')
            user_data_storage[user_id]['caption'] = message.text
            
            await send_suggestion_to_admin(update, context, user_id, category)
            
            if user_id in user_data_storage:
                del user_data_storage[user_id]
            user_states[user_id] = None
            await message.reply_text(
                "Спасибо за помощь! Ваше предложение отправлено.",
                reply_markup=get_main_keyboard()
            )
        return
    
    # Неизвестное состояние или команда
    await message.reply_text(
        "Выберите действие:",
        reply_markup=get_main_keyboard()
    )


async def send_suggestion_to_admin(update: Update, context: ContextTypes.DEFAULT_TYPE, user_id: int, category: str):
    """Отправляет предложение админу"""
    if not config.ADMIN_ID:
        logger.error("ID админа не установлен!")
        return
    
    user = update.effective_user
    user_info = f"@{user.username}" if user.username else user.first_name
    
    user_data = user_data_storage.get(user_id, {})
    file_data = user_data.get('file', {})
    caption = user_data.get('caption', 'Без названия')
    
    # Формируем сообщение для админа
    admin_message = (
        f"📦 Новое предложение\n\n"
        f"Пользователь: {user_info}\n"
        f"Категория: {CATEGORIES.get(category, category)}\n"
        f"Название/Описание: {caption}\n"
        f"Тип файла: {file_data.get('file_type', 'неизвестно')}"
    )
    
    # Отправляем файл и информацию админу
    file_id = file_data.get('file_id')
    file_type = file_data.get('file_type')
    
    try:
        if file_type == 'video':
            await context.bot.send_video(
                chat_id=config.ADMIN_ID,
                video=file_id,
                caption=admin_message
            )
        elif file_type == 'audio':
            await context.bot.send_audio(
                chat_id=config.ADMIN_ID,
                audio=file_id,
                caption=admin_message
            )
        elif file_type == 'photo':
            await context.bot.send_photo(
                chat_id=config.ADMIN_ID,
                photo=file_id,
                caption=admin_message
            )
        else:
            await context.bot.send_document(
                chat_id=config.ADMIN_ID,
                document=file_id,
                caption=admin_message
            )
    except Exception as e:
        logger.error(f"Ошибка отправки файла админу: {e}")
        await context.bot.send_message(
            chat_id=config.ADMIN_ID,
            text=f"{admin_message}\n\n⚠️ Ошибка отправки файла: {str(e)}"
        )


def main():
    """Запуск бота"""
    # Загружаем состояние при запуске
    load_state()
    
    # Создаем приложение
    application = Application.builder().token(config.BOT_TOKEN).build()
    
    # Регистрируем обработчики
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(button_callback))
    application.add_handler(MessageHandler(filters.ALL, handle_message))
    
    # Устанавливаем команды бота
    commands = [
        BotCommand("start", "Запустить бота"),
    ]
    try:
        application.bot.set_my_commands(commands)
    except Exception as e:
        logger.error(f"Ошибка установки команд: {e}")
    
    # Запускаем бота
    logger.info("Бот запущен!")
    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == '__main__':
    main()
