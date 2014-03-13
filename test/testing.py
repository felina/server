import MySQLdb as mdb
import sys
import requests
import json
import os
import re


port = 5000
path = 'http://localhost:' + str(port)
login_path = '/login'
user_login_data = {
	'email': 'sam.bodanis@gmail.com',
	'pass': 'assword'
}
db_settings = json.loads(open('config/db_settings.json', 'r').read())


def exec_sql_file(cursor, sql_file):
    print "\n[INFO] Executing SQL script file: '%s'" % (sql_file)
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
	    # cur.execute("SET sql_notes = 0;")
	    cur.execute("DROP DATABASE IF EXISTS felina;")
	    exec_sql_file(cur, '../tools/createDB.sql')
	    cur.execute("USE felina;")

	except mdb.Error, e:
	    print "Error %d: %s" % (e.args[0],e.args[1])
	    sys.exit(1)
	    
	finally:       
	    if con:    
	        con.close()

# def start_server():
# 	server_start = os.system("nodemon src/index.js &")#.read()
# 	print server_start
# 	if 'Listening on ' + port not in server_start:
# 		print 'Server did not start'
# 		os.exit(1)

def main():
	# start_server()
	clear_database()
	
	print 'Testing server at path ' + path

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

	print 'Test 2: Non existing user'
	r1 = requests.post(url=path + login_path, params={'email' : 'fakeEmail@gmail.com', 'pass' : 'fakepass'})
	if r1.text != 'Unregistered user.':
		print 'Fake user apparently exists: ' + r1.text

if __name__ == '__main__':
	main()

