# Felina Server

This is the server backend for Project Felina, the wildlife image analysis service.

It manages user authentication and image and metadata upload and storage. It also provides a facility for executing native computer vision executables that can access the database. The API responses are JSON and the database is MySQL.

## Installation

Get Node and npm, then

```bash
git clone https://github.com/felina/server.git
cd server
npm install
cp db_settings.json.example db_settings.json
cp config.json.example config.json
```

You will need an instance of MySQL with the schema already prepared. To do this:
```bash
tools/db_install.sh
```
This will connect to a server on localhost as root by default. Edit the script if you need to change the connection settings.

You should then update config.json with your AWS settings, and db_settings with your MySQL connection settings.

## Running

```bash
node src/index.js
```

## Testing

Create a new file ```test/db_settingsTest.json``` that is the same as ```config/db_settings.json``` but replace the line ```"database" : "felina"``` with ```"database" : "felinaTest"```, otherwise the server has issues.

Edit the file ```test/testConfig.json``` and change the paths of the two tests images to ones on your machine.  

To perform the tests run
```bash
python test/testing.py
```


## License

MIT
