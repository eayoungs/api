var net = require('net')
var then_redis = require('then-redis')

exports.factory = function() {
  var server = new net.Server();
  var redis = then_redis.createClient();

  server.timer = {
    mark: new Date(),
      hits: 0,
      reset: function() {
        this.mark = new Date()
        this.hits = 0
    }
  }

  server.clients = {
    list: [],
    add: function(client) {
      this.list.push(client)
    },
    remove: function(client) {
      var idx = this.list.indexOf(client)
        this.list.splice(idx,1)
    }
  }

  /* straight http request */
  server.request_token = function(params, cb) {
    redis.connect().then(function(){
      cb("abc123")
    })
  }

  server.build_client = function(socket) {
    return {socket: socket, flags: {}, following: []}
  }

  return server;
}
