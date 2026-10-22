# 🏗️ Hosting WintrChess locally

> This is a guide on how to get WintrChess running on your local machine.

## Prerequisites

- Git
- Node.js 22 or later
- Docker, if you want to host with that

## Setup

### Clone the repository

```sh
git clone https://github.com/wintrcat/wintrchess.git

# Go to the directory
cd wintrchess
```

### Set environment variables

These are the environment variables that you can set when hosting WintrChess:

```toml
NODE_ENV="production"
```

The environment that the app is running in. Can be one of two values: `production` (default) and `development`.

```toml
PORT=8080
```

The port that the backend server listens on. Defaults to `8080`.

```toml
ORIGIN="http://localhost:8080"
```
> Required

The origin - URLs in emails are constructed using this, and the authentication uses it as a base URL.
For example, `http://localhost:8080` or `https://wintrchess.com`.

```toml
TRUSTED_ORIGINS="https://app.example.com,https://*.example.dev"
```

Additional origins that authentication requests are accepted from, separated by commas. `ORIGIN` is always accepted. Supports `*` and `?` wildcards, which is useful when the app is served through a tunnel or preview deployment.

```toml
DATABASE_URL="sqlite:data/wintrchess.db"
```

The database to use. The tables are created automatically on startup.

- SQLite: `sqlite:data/wintrchess.db` or a plain file path. The file and its parent directory are created automatically. This is the default.
- MySQL / MariaDB: `mysql://user:password@host:3306/wintrchess` (or a `mariadb://` URL).
- PostgreSQL: `postgresql://user:password@host:5432/wintrchess` (or a `postgres://` URL).

The database user needs permission to create tables, or the tables must already exist.

```toml
SQLITE_PATH="data/wintrchess.db"
```

The path of the SQLite database file when `DATABASE_URL` is not set. The file and its parent directory are created automatically when the app starts. Defaults to `data/wintrchess.db`.

```toml
ANALYSIS_SESSION_ACTIONS=80
```

The number of actions that a user can take during an analysis session, before they have to solve a CAPTCHA again. Each request to the server using the analysis session to authorize oneself uses an action; this may be analysing a game or a single move added to the board. Defaults to `80`.

```toml
MAXIMUM_ARCHIVE_SIZE=50
```

The maximum number of games that the server will allow users to keep in their game archive. Defaults to `50`.

```toml
INTERNAL_PASSWORD="squidward"
```

The password for the internal dashboard, where administrators can change the announcement banner and author news posts.

```toml
AUTH_SECRET="12345678901234567890"
```
> Required

A random string used for authentication i.e hashing passwords, signing JWTs etc. Make sure it has a good amount of entropy.

```toml
GOOGLE_OAUTH_CLIENT_ID="12345678901234567890"
GOOGLE_OAUTH_CLIENT_SECRET="12345678901234567890"
```

Your Google OAuth client ID and secret, if you would like to enable Google sign-in.

```toml
ADS_PUBLISHER_ID="ca-pub-3914142339921252"
```

Your Google AdSense publisher ID, if you would like to enable advertisements. Note that advertisements will not display on local deployments.

```toml
ANALYTICS_MEASUREMENT_ID="G-EX024ZXSNX"
```

A Google Analytics Measurement ID, if you would like to enable analytics.

```toml
EMAIL_ACCOUNT="contact@wintrchess.com"
AUTOMATED_EMAIL_ADDRESS="no-reply@wintrchess.com"
AUTOMATED_EMAIL_KEY="aaaa bbbb cccc dddd"
```

The email address that should be listed as the contact for the website. The automated email address is the address that sends automated correspondence like email verification and password resets. To login to the account, use the automated email key, which is the password to the account / Google Workspace app password.

## Deploy manually

### Install dependencies

```sh
npm install
```

### Build the app

```sh
npm run build
```

You can also compile individual workspaces if you want with the `-w` flag:

```sh
npm run build -w client
npm run build -w server
npm run build -w shared
```

### Start the server

```sh
npm start
```

The server will begin listening on the port that you defined in the environment variables, or `8080` if you have not defined one.
Database tables are created automatically on startup. SQLite is the default at `SQLITE_PATH` (default `data/wintrchess.db`); set `DATABASE_URL` to a MySQL/MariaDB or PostgreSQL URL to use an external server instead.

## Deploy with Docker

You might find it easier to run WintrChess in a Docker container. The SQLite
database lives in the `wintrchess-database` volume, so it survives container
rebuilds. If you use MySQL or PostgreSQL, set `DATABASE_URL` to your server;
the volume is then unused.

### Build and start

```sh
docker compose up
```
