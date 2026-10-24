# Database Setup Guide

WintrChess supports both MongoDB and SQL databases for backend storage.

## Overview

The application automatically detects which database backend to use based on environment variables:

- **`DB_TYPE`**: Specifies the database type (`mongodb` or `sql`)
- **`DATABASE_URL`**: Database connection string
- **`SQLITE_PATH`**: SQLite database file path (alternative for SQL)

## MongoDB Setup (Default)

The default backend is MongoDB using Mongoose.

### Required Environment Variables

```bash
# MongoDB connection string
DATABASE_URI=mongodb://username:password@hostname:port/database-name

# Optional: Hostname whitelist for MongoDB
TRUSTED_ORIGINS=https://wintrchess.com
```

### Example MongoDB Configuration

```bash
# Local MongoDB
DATABASE_URI=mongodb://localhost:27017/wintrchess

# MongoDB Atlas
DATABASE_URI=mongodb+srv://username:password@cluster.mongodb.net/wintrchess

# Remote MongoDB with authentication
DATABASE_URI=mongodb://user:pass@192.168.1.100:27017/wintrchess
```

## SQL Database Setup

### SQLite (Recommended for Development)

SQLite is the default SQL backend and requires no external setup.

### Required Environment Variables

```bash
# Database type
DB_TYPE=sql

# Optional: Explicit SQLite path
SQLITE_PATH=./data/wintrchess.db

# For SQLite, you can also use a full path with file:// scheme
SQLITE_PATH=file:///C:/data/wintrchess.db
```

### PostgreSQL

**Prerequisities:**
- PostgreSQL 12 or later
- `postgres` npm package required

```bash
# Database type
DB_TYPE=sql

# PostgreSQL connection URL
DATABASE_URL=postgresql://username:password@localhost:5432/wintrchess
```

### MySQL / MariaDB

**Prerequisites:**
- MySQL 5.7 or MariaDB 10.3 or later
- `mysql2` npm package required

```bash
# Database type  
DB_TYPE=sql

# MySQL connection URL
DATABASE_URL=mysql://username:password@localhost:3306/wintrchess
```

## Choosing Between Backends

### When to Use MongoDB

- **Production with scale**: MongoDB handles large datasets better
- **Existing MongoDB infrastructure**: Already have MongoDB in production
- **Complex relationships**: MongoDB's document model is flexible

### When to Use SQL (SQLite/PostgreSQL/MySQL)

- **Simple deployments**: SQLite requires no external services
- **Cost reduction**: No need for separate database servers
- **ACID compliance**: Full transaction support
- **Lower maintenance**: Simpler setup and operations
- **Portability**: SQLite files can be easily copied and shared

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_TYPE` | No | `mongodb` | Database type (`mongodb` or `sql`) |
| `DATABASE_URL` | Yes (for non-default SQL) | `mongodb://database/wintrchess` | Database connection string |
| `SQLITE_PATH` | No | `data/wintrchess.db` | SQLite database file path |
| `DATABASE_URI` | No | `mongodb://database/wintrchess` | MongoDB connection string |
| `TRUSTED_ORIGINS` | No | - | Hostname whitelist for authentication |

## Migration from MongoDB to SQL

1. **Back up your data**:

```bash
# Use MongoDB tools to export data
mongodump --uri="$DATABASE_URI" --out ./backup
```

2. **Update environment variables**:

```bash
# Switch to SQL backend
export DB_TYPE=sql
export DATABASE_URL=./data/wintrchess.db
```

3. **Run the application**:

```bash
npm run build
npm start
```

4. **Data migration**: The application will automatically create new tables with the same data structure.

5. **Verify data**:

Once running, check your data has been imported correctly by visiting the diagnostics endpoint or checking the application logs.

## Troubleshooting

### MongoDB Connection Issues

**Issue**: `MongoNetworkError: failed to connect to server`

**Solution**:
- Check if MongoDB is running: `mongod --version`
- Verify DATABASE_URI format
- Check network connectivity

### SQLite Issues

**Issue**: `ENOSPC: System limit for number of file watchers reached`

**Solution**:
```bash
# Increase system file watcher limit
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### PostgreSQL Issues

**Issue**: `password authentication failed`

**Solution**:
- Verify username and password
- Grant proper permissions in PostgreSQL:
```sql
GRANT ALL PRIVILEGES ON DATABASE wintrchess TO username;
```

### MySQL Issues

**Issue**: `Access denied for user`

**Solution**:
- Grant proper privileges:
```sql
GRANT ALL PRIVILEGES ON wintrchess.* TO 'username'@'localhost';
FLUSH PRIVILEGES;
```

## Security Considerations

### MongoDB

- Use authentication credentials
- Restrict network access
- Enable TLS/SSL if possible
- Keep MongoDB credentials secure in environment variables

### PostgreSQL / MySQL

- Use strong passwords
- Restrict network access
- Enable SSL/TLS connections
- Keep database credentials secure
- Regular backups and rolling updates

### SQL File Permissions

- Restrict file system access to database files
- Use file permissions to prevent unauthorized access
- Regularly backup SQLite database files

## Monitoring

### MongoDB

Monitor connection pools, memory usage, and query patterns:
- MongoDB Atlas features: Metrics, Alerts, Tracing
- `db.serverStatus()` in mongosh

### PostgreSQL

Monitor connection counts, query performance:
- `\listing` in psql
- `pg_stat_activity` view
- `pg_stat_database` view

### MySQL

Monitor connection counts, query performance:
- `SHOW PROCESSLIST;`
- `SHOW STATUS LIKE '%Threads%';`
- `SHOW VARIABLES LIKE 'max_connections';`

## Performance Tips

### MongoDB

- Use connection pooling
- Optimize indexes for query patterns
- Monitor memory usage and consider sharding for large datasets

### PostgreSQL  

- Use appropriate schema design
- Create indexes for frequent queries
- Monitor `pg_stat_activity` for long-running queries

### SQLite

- SQLite handles concurrent reads well, but writes need coordination
- Consider using SQLite WAL mode (enabled by default)
- Regular backups to prevent data loss

### MySQL

- Use connection pooling
- Optimize indexes for query patterns
- Monitor slow queries with `slow_query_log`

## Support

For issues or questions about database setup:
- Check the issues on GitHub
- Review the Discord community
- See the documentation for your specific database backend