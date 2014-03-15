import MySQLdb as mdb
import sys
import requests
import json
import os
import re
import atexit
import subprocess
import time
import fcntl

port = 5000
path = 'http://localhost:' + str(port)
login_path = '/login'
register_path = '/register'
register_details = {
    'email' : 'test@gmail.com',
    'name' : 'testtest',
    'pass' : 'secrettest'
}
with open('config/db_settings.json', 'r') as db_settings_file:
    db_settings = json.loads(db_settings_file.read())
server_process = None


def exit_handler():
    swap_configs()

# 
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


# Remove old database if it exists and then load the
# test database. 
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

def nonBlockReadline(output):
    fd = output.fileno()
    fl = fcntl.fcntl(fd, fcntl.F_GETFL)
    fcntl.fcntl(fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)
    try:
        return output.readline()
    except:
        return ''

# def server_print(func):
#     def inner(*args, **kwargs):
#         r = func(*args, **kwargs)
#         while True:
#             line = ''
#             for c in iter(lambda: server_process.stdout.read(1), ''):
#                 line += c
#                 if c == '\n':
#                     print line
#                     break
#         return r
#     return inner


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
            # break
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
    fake_params = {'email' : 'fakeEmail@gmail.com', 'pass' : 'fakepass'}
    r = requests.post(url=path + login_path, data=fake_params)
    try:
        json_r = json.loads(r.text)
    except Exception, e:
        print 'Malformed response'
        raise e
    else:
        if json_r['res']:
            print 'Fake user apparently exists: ' + json_r

# @server_print
def register_user():
    print 'Test 3: Register user'
    r = requests.post(url=path + register_path, data=register_details)
    try:
        res = json.loads(r.text)['res']
    except Exception, e:
        print 'User registration failed with status: ' + r.status_code
        raise e
    else:                                                                      
        if not res:
            print 'User registration failed with message: ' + r.text

def main():
    swap_configs()
    clear_database()
    server_process = start_server()
    # start_server()

    print 'Testing server at path ' + path
    server_up()
    non_existing_user()
    register_user()

    # start = time.time()
    # while True:

        # if time.time() - start > 1:
            # break
        # line = server_process.stdout.readline()
        # line, err = server_process.communicate()
        # line = nonBlockReadline(server_process.stdout)
        # print line,
    # for c in iter(lambda: server_process.stdout.read(1), 'apples'):
    #     sys.stdout.write(c)
    server_process.kill()

if __name__ == '__main__':
    atexit.register(exit_handler)
    main()

