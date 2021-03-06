#! /usr/bin/env node

var fs = require('fs');
require('colors');

var aws = {
    accessKeyId: 'some_aws_id',
    secretAccessKey: 'some_aws_key',
    region: 'some-aws-region'
};

var fb = {
  clientID: 'FB_APP_ID',
  clientSecret: 'FB_APP_SECRET',
  callbackURL: 'http://www.felina.org/fb/callback'
};

var db = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'felina'
};

var smtp = {
    'service': 'Gmail',
    'auth': {
        'user': 'EMAIL',
        'pass': 'PASSWORD'
    }
};

var job_server = {
    'host': 'localhost',
    'port': 4999
};

var dir = 'config';

var pretty = function(o){
    return JSON.stringify(o, null, 2);
};

var write = function(name, data){
    var path = dir + '/' + name + '.json';
    console.log('  Creating config file ' + path.yellow);
    fs.writeFileSync(path, pretty(data));
};

console.log('Creating configuration files');
if(!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}
write('aws', aws);
write('db_settings', db);
write('fb', fb);
write('smtp', smtp);
write('job_server', job_server);

console.log('Done'.green);
