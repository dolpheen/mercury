# mercury
Утилита тестирования подключения к счетчикам меркурий
Для тестирования используестя преобразователь USR IoT модели USR-TCP232-304 в режиме TCP Server

**Установка**

npm install


**Примеры запуска**

*node app.js --type=230 --serial=13067832 --adapterUrl=usriot://192.168.1.100:8089 --count=200 --freq=60*

*node app.js --type=206 --serial=27361775 --adapterUrl=usriot://192.168.1.100:8089 --count=200 --freq=60*

где

type - модель счетчика
serial - серийный номер счетчика
adapterUrl - IP адрес и порт преобразователя RS485
count - количество запросов (по умолчанию 100)
freq - частота считывания запросов в минуту (по умолчанию 60 запросов в минуту)
