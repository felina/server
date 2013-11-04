# Felina Server

This is the server backend for Project Felina, the wildlife image analysis service.

It manages user authentication and image and metadata upload and storage. It also provides a facility for executing native computer vision executables that can access the database. The API responses are JSON and the database is MySQL.

## Installation

Get Node and npm, then

```bash
npm install -g coffee-script
git clone https://github.com/felina/server.git
cd server
npm install
```

## Running

```bash
coffee index.coffee
```

## License

MIT
