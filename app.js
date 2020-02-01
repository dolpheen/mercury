var net = require('net');
const url = require('url');
const argv = require('yargs').argv;

// Request Types for 203.2TD, 204, 208, 230, 231, 234, 236, 238
const m230_Test_Channel = 0x00;
const m230_Open_Channel = 0x01;
const m230_Close_Channel = 0x02;
const m230_Write_Param = 0x03;
const m230_Read_Time_Param = 0x04;
const m230_Read_Energy_Param = 0x05;
const m230_Read_Phys_Param = 0x06;
const m230_Write_Phys_Param = 0x07;
const m230_Read_Aux_Param = 0x08;
const m230_Read_Energy_Quadratic_Param = 0x15;

const m230_level_1 = 0x01;
const m230_level_2 = 0x02;
const m230_level1_password = [0x01, 0x01, 0x01, 0x01, 0x01, 0x01];
const m230_level2_password = [0x02, 0x02, 0x02, 0x02, 0x02, 0x02];

// Sleep ms function
const msleep = time => new Promise(resolve => setTimeout(_ => resolve(), time));

// Read command line arguments
if (!argv.type) {
    console.log('Error. Provide type argument.');
    process.exit();
}
if (!argv.serial) {
    console.log('Error. Provide serial argument.');
    process.exit();
}
if (!argv.adapterUrl) {
    console.log('Error. Provide address argument.');
    process.exit();
}

// Total requests for the test
var totalRequests = 100;
if (argv.count) {
    totalRequests = parseInt(argv.count);
}
// Requests per minute
var freq = 60;
if (argv.count) {
    freq = parseInt(argv.freq);
}

var type = argv.type;
// Check  valid serial
var serial = argv.serial;

var converterIp = url.parse(argv.adapterUrl).hostname;
var converterPort = url.parse(argv.adapterUrl).port;

var client = new net.Socket();

// Global App Sate
var currentCmd;

client.connect(converterPort, converterIp, async function () {
    console.log('Подключено к адаптеру RS485');

    var address;
    //
    //  Mercury 230 Commands
    //
    if (type == '230') {
        // Find real network address of the electric counter        
        if (serial.length < 8) {
            console.log('Error. Serial number < 8');
            process.exit();
        }
        serial = serial.toString()
        serial = serial.substr(serial.length - 3);
        if (parseInt(serial) > 239) {
            serial = serial.substr(1);
        }
        address = Buffer.from([parseInt(serial)]);

        //address2.writeUInt32BE(27361775);

        // var req = constructRequest(address1, [0x27]);
        // client.write(req);

        // Test connection
        console.log('Проверка соединения...');
        currentCmd = m230_Test_Channel;
        var req = constructRequest(address, currentCmd);
        client.write(req);

        // Open channel 
        await msleep(100);
        console.log('Открытие канала...');
        currentCmd = m230_Open_Channel;
        req = constructRequest(address, currentCmd, [m230_level_2, ...m230_level2_password]);
        client.write(req);

        // Read Energy 
        for (i = 0; i < totalRequests; i++) {
            await msleep(60000 / freq);
            console.log(`${i + 1}. Чтение данных...`);
            currentCmd = m230_Read_Energy_Param;
            req = constructRequest(address, currentCmd, [0x00, 0x00]);
            client.write(req);
        }
    }

    if (type == '206') {
        // Find real network address of the electric counter     
        address = Buffer.alloc(4);   
        address.writeUInt32BE(27361775);

        // var req = constructRequest(address1, [0x27]);
        // client.write(req);
        // Read Energy 
        for (i = 0; i < totalRequests; i++) {
            await msleep(60000 / freq);
            console.log(`${i + 1}. Чтение данных...`);
            currentCmd = m230_Read_Energy_Param;
            req = constructRequest(address, 0x27);
            client.write(req);
        }
    }
    console.log('Конец теста');
    process.exit();
});

client.on('data', function (data) {
    // Calculate CRC
    var crcActual = data.readUInt16LE(data.length - 2);
    var crcCalc = crc16MODBUS(data.slice(0, data.length - 2));
    console.log('Получены данные от счетчика: ' + data.toString('hex') + ' CRC:' + `${crcActual == crcCalc ? 'OK' : 'NOK'}`);
    if (currentCmd == m230_Read_Energy_Param && type == '230') {
        var tempBuffer = Buffer.from([data[2], data[1], data[4], data[3]]);
        var energyValue = tempBuffer.readUInt32BE();
        console.log('Энергия по сумме тарифов: ' + energyValue / 1000 + ' кВт·ч');
    }

    if (currentCmd == m230_Read_Energy_Param && type == '206') {
        var tarif1 = data.readUInt32BE(5);
        var tarif1String = ((tarif1 & 0xffffff00) >> 8).toString(16) + '.' + (tarif1 & 0xff).toString(16);

        var tarif2 = data.readUInt32BE(9);
        var tarif2String = ((tarif2 & 0xffffff00) >> 8).toString(16) + '.' + (tarif2 & 0xff).toString(16);

        var tarif3 = data.readUInt32BE(13);
        var tarif3String = ((tarif3 & 0xffffff00) >> 8).toString(16) + '.' + (tarif3 & 0xff).toString(16);

        var tarif4 = data.readUInt32BE(13);
        var tarif4String = ((tarif4 & 0xffffff00) >> 8).toString(16) + '.' + (tarif4 & 0xff).toString(16);
        
        //var tarif2 = data.readUInt32BE(4);
        console.log(`Энергия T1: ${tarif1String} кВт·ч, T2: ${tarif2String} кВт·ч, T3: ${tarif3String} кВт·ч, T4: ${tarif4String} кВт·ч`);
    }
    console.log('');
});

client.on('close', function () {
    console.log('Connection closed!');
});

console.log('Запуск теста');

// Prepare Raw Buffer for sending via RS-485 
function constructRequest(address, requestType, command) {
    var buf;
    if (command) {
        buf = Buffer.from([...address, requestType, ...command]);
    } else {
        buf = Buffer.from([...address, requestType]);
    }
    var crc = Buffer.alloc(2);
    crc.writeUInt16LE(crc16MODBUS(buf));
    return Buffer.concat([buf, Buffer.from(crc)]);
}

// CRC16 Algorithm with MODBUS polynome
function crc16MODBUS(buffer) {
    var CrcTable = [
        0X0000, 0XC0C1, 0XC181, 0X0140, 0XC301, 0X03C0, 0X0280, 0XC241,
        0XC601, 0X06C0, 0X0780, 0XC741, 0X0500, 0XC5C1, 0XC481, 0X0440,
        0XCC01, 0X0CC0, 0X0D80, 0XCD41, 0X0F00, 0XCFC1, 0XCE81, 0X0E40,
        0X0A00, 0XCAC1, 0XCB81, 0X0B40, 0XC901, 0X09C0, 0X0880, 0XC841,
        0XD801, 0X18C0, 0X1980, 0XD941, 0X1B00, 0XDBC1, 0XDA81, 0X1A40,
        0X1E00, 0XDEC1, 0XDF81, 0X1F40, 0XDD01, 0X1DC0, 0X1C80, 0XDC41,
        0X1400, 0XD4C1, 0XD581, 0X1540, 0XD701, 0X17C0, 0X1680, 0XD641,
        0XD201, 0X12C0, 0X1380, 0XD341, 0X1100, 0XD1C1, 0XD081, 0X1040,
        0XF001, 0X30C0, 0X3180, 0XF141, 0X3300, 0XF3C1, 0XF281, 0X3240,
        0X3600, 0XF6C1, 0XF781, 0X3740, 0XF501, 0X35C0, 0X3480, 0XF441,
        0X3C00, 0XFCC1, 0XFD81, 0X3D40, 0XFF01, 0X3FC0, 0X3E80, 0XFE41,
        0XFA01, 0X3AC0, 0X3B80, 0XFB41, 0X3900, 0XF9C1, 0XF881, 0X3840,
        0X2800, 0XE8C1, 0XE981, 0X2940, 0XEB01, 0X2BC0, 0X2A80, 0XEA41,
        0XEE01, 0X2EC0, 0X2F80, 0XEF41, 0X2D00, 0XEDC1, 0XEC81, 0X2C40,
        0XE401, 0X24C0, 0X2580, 0XE541, 0X2700, 0XE7C1, 0XE681, 0X2640,
        0X2200, 0XE2C1, 0XE381, 0X2340, 0XE101, 0X21C0, 0X2080, 0XE041,
        0XA001, 0X60C0, 0X6180, 0XA141, 0X6300, 0XA3C1, 0XA281, 0X6240,
        0X6600, 0XA6C1, 0XA781, 0X6740, 0XA501, 0X65C0, 0X6480, 0XA441,
        0X6C00, 0XACC1, 0XAD81, 0X6D40, 0XAF01, 0X6FC0, 0X6E80, 0XAE41,
        0XAA01, 0X6AC0, 0X6B80, 0XAB41, 0X6900, 0XA9C1, 0XA881, 0X6840,
        0X7800, 0XB8C1, 0XB981, 0X7940, 0XBB01, 0X7BC0, 0X7A80, 0XBA41,
        0XBE01, 0X7EC0, 0X7F80, 0XBF41, 0X7D00, 0XBDC1, 0XBC81, 0X7C40,
        0XB401, 0X74C0, 0X7580, 0XB541, 0X7700, 0XB7C1, 0XB681, 0X7640,
        0X7200, 0XB2C1, 0XB381, 0X7340, 0XB101, 0X71C0, 0X7080, 0XB041,
        0X5000, 0X90C1, 0X9181, 0X5140, 0X9301, 0X53C0, 0X5280, 0X9241,
        0X9601, 0X56C0, 0X5780, 0X9741, 0X5500, 0X95C1, 0X9481, 0X5440,
        0X9C01, 0X5CC0, 0X5D80, 0X9D41, 0X5F00, 0X9FC1, 0X9E81, 0X5E40,
        0X5A00, 0X9AC1, 0X9B81, 0X5B40, 0X9901, 0X59C0, 0X5880, 0X9841,
        0X8801, 0X48C0, 0X4980, 0X8941, 0X4B00, 0X8BC1, 0X8A81, 0X4A40,
        0X4E00, 0X8EC1, 0X8F81, 0X4F40, 0X8D01, 0X4DC0, 0X4C80, 0X8C41,
        0X4400, 0X84C1, 0X8581, 0X4540, 0X8701, 0X47C0, 0X4680, 0X8641,
        0X8201, 0X42C0, 0X4380, 0X8341, 0X4100, 0X81C1, 0X8081, 0X4040
    ];

    var crc = 0xFFFF;

    for (var i = 0, l = buffer.length; i < l; i++) {
        crc = ((crc >> 8) ^ CrcTable[(crc ^ buffer[i]) & 0xFF]);
    };

    return crc;
}

