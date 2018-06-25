var cmd = require('node-cmd');
var path, node_ssh, ssh, fs;
fs = require('fs');
path = require('path');
node_ssh = require('node-ssh');
ssh = new node_ssh();

// the method that starts the deployment process
function main() {
  console.log('Deployment started.');
  cloneRepo();
}

// responsible for cloning the repo
function cloneRepo() {
  console.log('Cloning repo...');
  // delete old copy of repo. Then, clone a fresh copy of repo from GitHub
  cmd.get(
    'rm -rf hackathon-starter && git clone https://github.com/sahat/hackathon-starter.git',
    function(err, data, stderr) {
      console.log(
        'cloneRepo callback\n\t err: ' +
          err +
          '\n\t data: ' +
          data +
          '\n\t stderr: ' +
          stderr
      );
      if (err == null) {
        sshConnect();
      }
    }
  );
}

// transfers local project to the remote server
function transferProjectToRemote(failed, successful) {
  return ssh.putDirectory(
    __dirname + '/hackathon-starter',
    '/home/ubuntu/hackathon-starter-temp',
    {
      recursive: true,
      concurrency: 1,
      validate: function(itemPath) {
        const baseName = path.basename(itemPath);
        return (
          baseName.substr(0, 1) !== '.' && baseName !== 'node_modules' // do not allow dot files
        ); // do not allow node_modules
      },
      tick: function(localPath, remotePath, error) {
        if (error) {
          failed.push(localPath);
          console.log('failed.push: ' + localPath);
        } else {
          successful.push(localPath);
          console.log('successful.push: ' + localPath);
        }
      }
    }
  );
}

// creates a temporary folder on the remote server
function createRemoteTempFolder() {
  return ssh.execCommand(
    'rm -rf hackathon-starter-temp && mkdir hackathon-starter-temp',
    { cwd: '/home/ubuntu' }
  );
}

// stops mongodb and node services on the remote server
function stopRemoteServices() {
  return ssh.execCommand('npm stop && sudo service mongod stop', {
    cwd: '/home/ubuntu'
  });
}

// updates the project on the server
function updateRemoteApp() {
  return ssh.execCommand(
    'cp -r hackathon-starter-temp/* hackathon-starter/ && rm -rf hackathon-starter-temp/*',
    { cwd: '/home/ubuntu' }
  );
}

// restart mongodb and node services on the remote server
function restartRemoteServices() {
  return ssh.execCommand('npm start && sudo service mongod start', {
    cwd: '/home/ubuntu'
  });
}

// connect to the remote server
function sshConnect() {
  console.log('Connecting to the server...');

  ssh
    .connect({
      host: '18.222.152.63',
      username: 'ubuntu',
      privateKey: 'hs-key2.pem'
    })
    .then(function() {
      console.log('SSH Connection established.');

      // Create "hackathon-starter-temp" directory on remote server
      console.log('Creating `hackathon-starter-temp` folder.');

      return createRemoteTempFolder();
    })
    .then(function(result) {
      const failed = [];
      const successful = [];
      if (result.stdout) {
        console.log('STDOUT: ' + result.stdout);
      }
      if (result.stderr) {
        console.log('STDERR: ' + result.stderr);
        return Promise.reject(result.stderr);
      }
      return transferProjectToRemote(failed, successful);
    })
    .then(function(status) {
      if (status) {
        return stopRemoteServices();
      } else {
        return Promise.reject(failed.join(', '));
      }
    })
    .then(function(status) {
      if (status) {
        return updateRemoteApp();
      } else {
        return Promise.reject(failed.join(', '));
      }
    })
    .then(function(status) {
      if (status) {
        return restartRemoteServices();
      } else {
        return Promise.reject(failed.join(', '));
      }
    })
    .then(function() {
      console.log('Deployment complete.');
      process.exit(0);
    })
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}

main();
