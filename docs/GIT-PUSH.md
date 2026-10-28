# Как залить проект в Git

Проект уже под git: создан репозиторий, ветка `main`, первый коммит, `.gitignore`, `LICENSE` и `README.md`.
Осталось добавить удалённый репозиторий (remote) и запушить. Из моей песочницы нет доступа к GitHub
(коннектор недоступен, токенов и SSH-ключей нет), поэтому пуш делается с вашей машины — три способа ниже.

Рабочая папка проекта: `porcia/`
История: файл `porcia.bundle` (переносит репозиторий вместе с коммитами)
Архив без git: `porcia-project.tar.gz`

---

## Вариант 1. GitHub через браузер (самый простой)

1. Создайте пустой репозиторий на github.com (без README и .gitignore — они уже есть).
2. Скачайте папку `porcia` из воркспейса и выполните в ней:

```bash
git remote add origin https://github.com/<ваш-логин>/porcia.git
git push -u origin main
```

GitHub попросит логин и **personal access token** вместо пароля:
Settings → Developer settings → Personal access tokens → Tokens (classic) → scope `repo`.

## Вариант 2. GitHub CLI (создаёт репозиторий за вас)

```bash
cd porcia
gh auth login                       # вход через браузер
gh repo create porcia --private --source=. --remote=origin --push
```

## Вариант 3. Если папку неудобно скачивать — используйте бандл

```bash
git clone porcia.bundle porcia
cd porcia
git remote set-url origin https://github.com/<ваш-логин>/porcia.git
git push -u origin main
```

## Другие платформы

```bash
# GitLab
git remote add origin https://gitlab.com/<логин>/porcia.git && git push -u origin main

# Bitbucket
git remote add origin https://bitbucket.org/<логин>/porcia.git && git push -u origin main

# Свой сервер (SSH)
git remote add origin git@server:repos/porcia.git && git push -u origin main
```

Без внешнего хостинга репозиторий уже существует локально в папке `porcia/.git` —
его можно скопировать на любой сервер вместе с папкой.

---

## Что уже настроено в репозитории

| Файл / настройка | Зачем |
|---|---|
| `.gitignore` | не коммитит `data/db.json` (заказы), `data/uploads/*` (фото гостей), `node_modules`, `.env` |
| `data/uploads/.gitkeep` | сохраняет пустую папку для загрузок |
| `LICENSE` (MIT) | чтобы код можно было использовать и показывать заказчику |
| `README.md` | запуск, экраны, возможности, API, структура, план развития |
| `package.json` | скрипты `npm start`, `npm run seed`; `engines.node >= 18` |
| ветка `main` + 1 коммит | готово к пушу, ничего переинициализировать не нужно |

Проверить перед пушем:

```bash
git status          # должно быть "nothing to commit, working tree clean"
git log --oneline   # история коммитов
git ls-files        # что именно уйдёт в репозиторий (db.json там быть не должно)
```

## Если хотите другую лицензию или приватность

- Приватный репозиторий: `gh repo create porcia --private --source=. --remote=origin --push`
- Другая лицензия: замените `LICENSE` (например, проприетарная: «Все права защищены»)
- Не публиковать фото блюд: удалите `public/assets/*.jpg` из индекса
  (`git rm --cached public/assets/*.jpg`) и положите свои.

## Полезно после пуша

```bash
# деплой на сервере (Node.js 18+, без зависимостей)
git clone https://github.com/<логин>/porcia.git && cd porcia
PORT=3000 node server.js

# обновление на сервере
git pull && systemctl restart porcia   # или pm2 restart porcia
```

Для продакшена стоит вынести `data/` на постоянный диск или подключить БД —
точки замены: `load()`, `save()`, `publicState()` в `server.js`.
