# DeepSeek Harness

[English](README.md) | [中文](README.zh.md) | Русский

DeepSeek Harness (`dsh`) — открытая среда для запуска ИИ-агентов, разработанная [DeepSeek AI](https://deepseek.com).

Harness построен на [Cordis](https://github.com/cordiverse/cordis). Его возможности реализованы плагинами. Архитектура Cordis описана в статье [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

[Документация DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/)

## Наш комплект для macOS

Комплект **stable-2026.11.18-1** предназначен для оригинального подписанного приложения **DSH Desktop 0.2.2-rc.3** на Mac с Apple Silicon. Исходники в форке основаны на **Harness 0.2.2-rc.4**.

Плагин **Codex 0.3.4-rc.5** добавляет вход через ChatGPT, модели GPT-6.2 Astra и Sol, режим Fast, отображение квот, создание и редактирование изображений в чате. В комплект также входят встроенные роли агентов, Workspace tools, Project Passport, Task templates, интеграция Firecrawl MCP и адаптер DSH для Graphify **0.9.111**. Размеры готового изображения могут отличаться от запрошенных.

[Установка комплекта Desktop](local-distribution/README.ru.md) · [Версии компонентов](local-distribution/versions.json) · [Контрольные суммы](local-distribution/SHA256SUMS) · [Результаты проверок](local-distribution/evidence/build-2026.11.18.json)

## Предварительная версия для разработчиков

DeepSeek Harness активно развивается. Обновления могут нарушать совместимость с существующими плагинами и настройками.

Перед запуском прочитайте [замечания по безопасности](SAFETY.md).

<a id="run"></a>

## Запуск Web UI

Выберите запуск опубликованного npm-пакета или сборку исходников.

### Из npm

После установки Node.js запустите Web UI из npm.

```sh
npx @deepseek-ai/dsh web
```

По умолчанию Web UI доступен по адресу `http://127.0.0.1:3080`. При локальном запуске команда открывает страницу в браузере по умолчанию. При запуске через SSH она выводит адрес сервера для подключения через проброс порта. Флаг `--no-open` запускает сервер без открытия браузера. [Руководство по Web UI](docs/user/guide/index.md)

<a id="run-from-source"></a>

### Из исходников DeepSeek AI

Для сборки Web UI из исходников понадобятся Node.js и pnpm.

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` собирает проект. Команда `pnpm dsh web` запускает Web UI из готовой сборки.

## Сообщество и поддержка

- Сообщайте об ошибках и оставляйте отзывы в [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Добавляйте тему [`dsh-plugin`](https://github.com/topics/dsh-plugin) в репозиторий своего плагина, чтобы его было проще найти.
- Присоединяйтесь к <a href="https://discord.gg/4MrtZUhpxg">сообществу DeepSeek Harness в Discord</a>.

## Как внести вклад

Порядок работы с изменениями описан в [CONTRIBUTING.md](CONTRIBUTING.md).

## Разработка

Начните с [руководства по разработке](docs/development.md) и [описания архитектуры](docs/architecture.md).

`pnpm run dev:web` собирает и запускает Web UI и пересобирает клиентский код при правках. Команда `make help` показывает цели Make для Web и Desktop. Полный список команд есть в руководстве по разработке.

Инструкции для агентов находятся в [AGENTS.md](AGENTS.md).

## Цитирование

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## Лицензия

[MIT](LICENSE)

Сведения о сторонних зависимостях и их лицензиях приведены в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
