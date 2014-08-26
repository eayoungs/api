var net = require('net')
var crypto = require('crypto')
var then_redis = require('then-redis')
var uuid = require('node-uuid');

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

  server.create_token_temp = function(params) {
    var token = "session_key-"+uuid.v4()
    var device_key = sha256(params.device_id+token)
    return redis.connect().then(function(){
      // todo: session_key, use device_key for now
      var session_value = {device_id: params.device_id, email: params.email}
      return redis.hset("session_keys", device_key, JSON.stringify(session_value)).then(function(){
        return token
      })
    })
  }

  server.token_validate = function(device_key, device_id) {
    return redis.connect().then(function(){
      var session_value = {device_id: device_id}
      return redis.hset("session_keys", device_key, JSON.stringify(session_value)).then(function(){
        console.dir(session_value)
        return token
      })
    })
  }

  server.find_session = function(token) {
    return redis.connect().then(function(){
      return redis.hget("session_keys", token).then(function(session_json){
        var session = JSON.parse(session_json)
        console.dir(session)
        return session
      })
    })
  }

  server.build_client = function(socket) {
    return {socket: socket, flags: {}, following: []}
  }

  function sha256(text) {
    var shasum = crypto.createHash('sha256');
    shasum.update(text)
    return shasum.digest('base64')
  }

  return server;
}
