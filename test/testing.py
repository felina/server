import MySQLdb as mdb
import sys
import requests
import json
import os
import re
import atexit
import subprocess
import time


port = 5000
path = 'http://localhost:' + str(port)
login_path = '/login'
user_login_data = {
    'email': 'sam.bodanis@gmail.com',
    'pass': 'assword'
}
with open('config/db_settings.json', 'r') as db_settings_file:
    db_settings = json.loads(db_settings_file.read())

def exit_handler():
    swapConfigs()

def swap_configs():
    os.system('mv config/db_settings.json test/db_settings.json')
    os.system('mv test/db_settingsTest.json config/db_settings.json')
    os.system('mv test/db_settings.json test/db_settingsTest.json')

def exec_sql_file(cursor, sql_file):
    print "[INFO] Executing SQL script file: '%s'" % (sql_file)
    statement = ""

    for line in open(sql_file):
        if re.match(r'--', line):  # ignore sql comment lines
            continue
        if not re.search(r'[^-;]+;', line):  # keep appending lines that don't end in ';'
            statement = statement + line
        else:  # when you get a line ending in ';' then exec statement and reset for next statement
            statement = statement + line
            #print "\n\n[DEBUG] Executing SQL statement:\n%s" % (statement)
            try:
                cursor.execute(statement)
            except (OperationalError, ProgrammingError) as e:
                print "\n[WARN] MySQLError during execute statement \n\tArgs: '%s'" % (str(e.args))

            statement = ""

def clear_database():
    try:
        # os
        con = mdb.connect(db_settings['host'], 
                          db_settings['user'], 
                          db_settings['password'], 
                          local_infile = 1)
        cur = con.cursor()
        cur.execute("SELECT VERSION()")
        ver = cur.fetchone()
        print "Database version : %s " % ver
        cur.execute("SET sql_notes = 0;")
        cur.execute("DROP DATABASE IF EXISTS felinaTest;")
        exec_sql_file(cur, 'test/createTestDB.sql')
        cur.execute("USE felinaTest;")

    except mdb.Error, e:
        print "Error %d: %s" % (e.args[0],e.args[1])
        sys.exit(1)
        
    finally:       
        if con:    
            con.close()

def start_server():
    start = time.time()
    process = subprocess.Popen('node src/index.js', stdout=subprocess.PIPE, shell=True)
    output = ''
    for c in iter(lambda: process.stdout.read(1), ''):
        if time.time() - start > 10:
            print 'Server connection timed out'
            sys.exit(1)
        sys.stdout.write(c)
        output += c
        if 'Listening on ' + str(port) in output:
            print '\nServer initialized'
            return process

def server_up():
    print 'Test 1: Server up'
    r = requests.get(url=path)
    expected_status_code = 200
    if r.status_code != expected_status_code:
        print 'The server does not appear to be up'
        print 'Expected ' + expected_status_code + ' but got ' + r.status_code
        os.exit(1)
    result_object = json.loads(r.text)
    if not result_object['res']:
        print 'Result object is malformed: ' + json.dumps(result_object)
        os.exit(1)

def non_existing_user():
    print 'Test 2: Non existing user'
    r1 = requests.post(url=path + login_path, params={'email' : 'fakeEmail@gmail.com', 'pass' : 'fakepass'})
    if r1.text != 'Unregistered user.':
        print 'Fake user apparently exists: ' + r1.text

def main():
    swap_configs()
    clear_database()
    server_process = start_server()

    print 'Testing server at path ' + path
    server_up()
    non_existing_user()
    register_user()

    server_process.kill()

if __name__ == '__main__':
    atexit.register(exit_handler)
    main()

