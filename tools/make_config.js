#! /usr/bin/env node

var fs = require('fs');

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

var write = function(name, data){
    fs.writeFileSync('config/' + name + '.json', JSON.stringify(data, null, 2));
};

console.log('Creating configuration files');
if(!fs.existsSync('config')){
    fs.mkdirSync('config');
}
write('aws', aws);
write('db_settings', db);
write('fb', fb);

console.log('Done');
