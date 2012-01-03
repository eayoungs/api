var net = require('net');
var wsock = require('websock');
var settings = require('./settings');

wsock.listen(settings.websockets.listen_port, ws_connect);
console.log("websockets listening on "+settings.websockets.listen_port)

function ws_connect(socket) {
  console.log('ws_connect')
  var apiSocket;

  console.log('ws open. connecting to '+settings.api.listen_port);
  apiSocket = net.connect(settings.api.listen_port, "localhost")

  apiSocket.on('data', function(data) {
    console.log('-> '+data)
    socket.send(data)
  })
  
  apiSocket.on('err', function(exception) {
    console.log("apiSocket error: "+exception);
  })

  socket.on('message', function(data) {
    console.log('<- '+data)
    apiSocket.write(data+"\n")
  });

  socket.on('close', function() {
    apiSocket.end();
    console.log('ws close');
  });

}
