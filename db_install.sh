#!/bin/sh
# Setup `felina` database on local MySQL
mysql -uroot -p < createDB.sql

# Switch for remote host
# mysql -uroot -p -h db.example.com < createDB.sql
