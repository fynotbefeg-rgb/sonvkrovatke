# Выгрузка готовых Reels на Google Drive

Команда `npm run upload:topic -- <тема>` отправляет три файла темы из `pv/out/` на Google Drive:

```
out/R-<тема>-h1.mp4
out/R-<тема>-h2.mp4
out/R-<тема>-h3.mp4
```

Файлы загружаются как есть, без перекодирования и сжатия. Ограничения по размеру нет.
Если хотя бы одного файла нет или он пустой, загрузка не начинается.

Загрузку выполняет [rclone](https://rclone.org). Доступ к Google Drive хранится в конфиге rclone на вашем компьютере, а не в репозитории.

## 1. Установка rclone (один раз)

**Windows** (PowerShell):
```powershell
winget install Rclone.Rclone
```
Или скачайте архив с https://rclone.org/downloads/ и добавьте папку с `rclone.exe` в PATH.
Проверка (в новом окне терминала): `rclone version`.

**Linux:**
```bash
sudo apt install rclone      # или: curl https://rclone.org/install.sh | sudo bash
rclone version
```

## 2. Подключение Google Drive (один раз)

```
rclone config
```
1. `n` — новый remote, имя: `gdrive`.
2. Storage: `drive` (Google Drive).
3. `client_id` и `client_secret` — оставить пустыми (Enter).
4. Scope: `1` (full access) или `3` (`drive.file` — доступ только к файлам, созданным rclone).
5. Остальное — по умолчанию. На шаге авторизации откроется браузер: войдите в нужный Google-аккаунт и разрешите доступ.
6. Shared Drive — `n`, если используете обычный «Мой диск».

Проверка: `rclone lsd gdrive:` — покажет папки диска.

**Сервер без браузера:** на шаге `Use auto config?` ответьте `n`, затем на компьютере с браузером выполните `rclone authorize "drive"` и вставьте полученный токен в сервер.

Где хранится доступ (не добавляйте эти файлы в git и никому не пересылайте):
- Windows: `%APPDATA%\rclone\rclone.conf`
- Linux: `~/.config/rclone/rclone.conf`

## 3. Папка назначения

Укажите remote и папку в переменной окружения `ROMAN_DRIVE_REMOTE`. Тема добавляется к пути автоматически.

**Windows, PowerShell** — на текущее окно:
```powershell
$env:ROMAN_DRIVE_REMOTE = "gdrive:Roman/finished-reels"
```
Насовсем (подействует в новых окнах терминала):
```powershell
setx ROMAN_DRIVE_REMOTE "gdrive:Roman/finished-reels"
```

**Linux / macOS:**
```bash
export ROMAN_DRIVE_REMOTE="gdrive:Roman/finished-reels"   # добавить в ~/.bashrc, чтобы не вводить каждый раз
```

Для темы `manychat` файлы попадут в `Roman/finished-reels/manychat/` на Google Drive. Папки создаются автоматически.

## 4. Запуск

Из папки `roman-reels/pv`:

```bash
npm ci                                   # один раз: зависимости
npm run render:topic -- manychat         # рендер R-manychat-h1/h2/h3 → out/
npm run upload:topic -- manychat --dry-run   # проверка: что и куда уйдёт, без загрузки
npm run upload:topic -- manychat         # загрузка трёх MP4 на Google Drive
```

Для рендера в `pv/public/rr/<тема>/` должны лежать `h1.mp4`, `h2.mp4`, `h3.mp4`, `osnova.mp4`, а все вставки темы — в `pv/public/ai/` и `pv/public/ai2/`. Видео-исходники хранятся на Google Drive, не в git.

## Частые ошибки

| Сообщение | Что сделать |
|---|---|
| `Set ROMAN_DRIVE_REMOTE…` | Задать переменную (шаг 3) и открыть новый терминал, если использовали `setx` |
| `Missing or empty video(s)…` | Сначала выполнить `npm run render:topic -- <тема>`; проверить, что рендер не прервался |
| `rclone is not installed or unavailable in PATH.` | Установить rclone (шаг 1) и перезапустить терминал |
| `Upload failed: …` | Проверить доступ: `rclone lsd gdrive:`; при истёкшей авторизации — `rclone config reconnect gdrive:` |

При повторной загрузке rclone пропускает файл, если на Drive уже лежит такой же (совпадают размер и время изменения), а изменённый файл заменяет.
