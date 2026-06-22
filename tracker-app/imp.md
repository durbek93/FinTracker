# Рефакторинг интеграции ИИ и оптимизация токенов в Finance Tracker

Проведение комплексного рефакторинга ИИ-модуля на основе планов `ai_token_optimization.md` и `ai_integration_plan.md` (Этап 5). Рефакторинг включает перенос базовых промптов в `systemInstruction` модели Gemini, внедрение пресетов финансовых стратегий и вывод информации об использованных токенах в интерфейсе для прозрачности и контроля расходов.

## User Review Required

> [!IMPORTANT]
> Мы добавляем в `localStorage` новый ключ `gemini_strategy` для сохранения выбранной стратегии.
> Дополнительные текстовые инструкции пользователя теперь будут работать в паре с выбранным пресетом.

## Proposed Changes

### 1. Сервисы ИИ (AI Services)

#### [MODIFY] [gemini.ts](file:///mnt/c/Users/Jamshid/.gemini/antigravity-ide/scratch/tracker-app/src/lib/gemini.ts)
- Описать справочник пресетов стратегий `FINANCIAL_STRATEGIES` (50/30/20, 15/25/50/10, Минимализм, Максимальное накопление).
- Отрефакторить `parseTransactionText` и `getFinancialAdvice` для инициализации моделей с параметром `systemInstruction`.
- Извлечь метаданные потребления токенов (`usageMetadata`) из ответа API и добавить их в возвращаемый объект отчетов/транзакций.

---

### 2. Пользовательский интерфейс (UI Components & Pages)

#### [MODIFY] [SettingsSidebar.tsx](file:///mnt/c/Users/Jamshid/.gemini/antigravity-ide/scratch/tracker-app/src/components/SettingsSidebar.tsx)
- Добавить выпадающий список (Select) для выбора финансовой стратегии (поддерживает реактивное сохранение в `localStorage`).
- Переименовать текстовое поле "Инструкции для ИИ" в "Дополнительные пожелания", сделав его комплементарным к выбранной стратегии.

#### [MODIFY] [Analytics.tsx](file:///mnt/c/Users/Jamshid/.gemini/antigravity-ide/scratch/tracker-app/src/pages/Analytics.tsx)
- Отобразить блок с количеством потраченных токенов (входных, выходных и общих) под сгенерированным AI-отчетом.
- Добавить стилизованный бейдж "Стратегия: [Название стратегии]" в шапку AI-аналитика.

---

### 3. Файлы документации (Documentation Updates)

#### [MODIFY] [ai_token_optimization.md](file:///mnt/c/Users/Jamshid/.gemini/antigravity-ide/scratch/tracker-app/ai_token_optimization.md)
- Отметить выполненные задачи по оптимизации токенов.

#### [MODIFY] [ai_integration_plan.md](file:///mnt/c/Users/Jamshid/.gemini/antigravity-ide/scratch/tracker-app/ai_integration_plan.md)
- Отметить Этап 5 как завершенный.

## Verification Plan

### Automated Tests
- Запуск сборки проекта для проверки отсутствия ошибок типизации:
  `npm run build`
- Проверка линтинга:
  `npm run lint`

### Manual Verification
- Выбор стратегии "Минимализм" в настройках и генерация финансового отчета в разделе "Статистика". Проверка, что советы ориентированы на жесткую экономию и под отчетом отображаются потраченные токены.
- Ввод тестовой транзакции через AI Smart Input и проверка логов консоли браузера на предмет вывода токенов.
