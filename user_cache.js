var redis = require("redis");

var client = redis.createClient();

module.exports = {};

function session_db_id(id){
    var id = id.replace(/[^A-Za-z0-9]/g,"");
    return "user_session:"+id;
}

module.exports.store_user = function(id, data){
    var data = JSON.stringify(data);

    var id = session_db_id(id);
    
    if(id.length == 0){
        return;
    }
    
    client.set(id, data, function(err, reply){
        if(err != null){
            console.log("err: " + err);
        }
    });
};

module.exports.logout = function(session_id){
    var id = session_db_id(session_id);
    client.del(id, function(err, reply){
        if(err != null){
            console.log("err: " + err);
        }
    });
};

/*
  
  Gets user from temp db
  callback(data)
  
*/
module.exports.get_user = function(id, callback){
    var id = session_db_id(id);
    
    if(id.length == 0){
        return;
    }
    
    client.get(id, function(err, reply){
        if(err != null){
            console.log("err: " + err);
        }
        callback(JSON.parse(reply));
    });
};

/*
  
  Does a temp user exist in redis?
  
  callback(bool: exists)
  
*/
module.exports.exists = function(id, callback){
    if(id == undefined || id == ""){
        return false;
    }
    
    var id = session_db_id(id);

    if(id.length == 0){
        callback(false);
        return;
    }
    
    client.exists(id, function(err, exists){
        if(err != null){
            console.log("err: " + err);
        }
        callback(exists);
    });
};
