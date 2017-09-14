'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const urllib = require('urllib');
const assert = require('assert');
const shell = require('shelljs');
const compressing = require('compressing');
const rimraf = require('mz-modules/rimraf');
const mkdirp = require('mz-modules/mkdirp');
const co = require('co');
const utils = require('./utils');

// 参考 egg-init 实现
module.exports = class Download {
  constructor(config = {}) {
    this.tempDir = path.join(os.tmpdir(), 'easywebpack-cli-init');
    this.registry = config.registry || 'https://registry.npmjs.org';
  }

  *getPackageInfo(pkgName) {
    utils.log(`query npm info of ${pkgName}`);
    const url = `${this.registry}/${pkgName}/latest`;
    try {
      const result = yield urllib.request(url, {
        dataType: 'json',
        followRedirect: true
      });
      assert(result.status === 200, `npm info ${pkgName} got error: ${result.status}, ${result.data.reason}`);
      return result.data;
    } catch (err) {
      throw err;
    }
  }

  *download(pkgName) {
    const result = yield this.getPackageInfo(pkgName);
    const tgzUrl = result.dist.tarball;
    yield rimraf(this.tempDir);

    utils.log(`downloading ${tgzUrl}`);
    const response = yield urllib.request(tgzUrl, { streaming: true, followRedirect: true });
    yield compressing.tgz.uncompress(response.res, this.tempDir);

    utils.log(`extract to ${this.tempDir}`);
    return path.join(this.tempDir, '/package');
  }

  copy(sourceDir, targetDir, option = { dir: '' }) {
    if (option.dir) {
      shell.cp('-R', path.join(sourceDir, option.dir), targetDir);
    } else {
      shell.cp('-R', path.join(sourceDir, '*'), targetDir);
      if (option.hide) {

        // copy hide file
        shell.cp('-R', path.join(sourceDir, '.*'), targetDir);
      }
    }
  }

  writeFile(filepath, content) {
    try {
      fs.writeFileSync(filepath, typeof content === 'string' ? content : JSON.stringify(content), 'utf8');
    } catch (e) {
      console.error(`writeFile ${filepath} err`, e);
    }
  }

  updatePackageFile(fileDir, info = {}) {
    const filepath = path.join(fileDir, 'package.json');
    const packageJSON = require(filepath);
    packageJSON.name = info.name || packageJSON.name;
    packageJSON.description = info.description || packageJSON.description;
    this.writeFile(filepath, packageJSON);
  }

  init(dir, pkgName, answer = {}, option = {}) {
    const self = this;
    if (option.type === 'cli') {
      const projectDir = dir;
      co(function *() {
        const sourceDir = yield self.download(pkgName);
        const fileDir = path.join(sourceDir, option.action);
        self.copy(fileDir, projectDir, { dir: option.dir });
        utils.log(`init ${option.action} cli [webpack.config.js] successfully!`);
      }).catch(err => {
        console.log('init error', err);
      });
    } else {
      const name = answer.name || pkgName;
      const description = answer.description || '';
      const projectDir = path.join(dir, name);
      co(function *() {
        const sourceDir = yield self.download(pkgName);
        yield mkdirp(projectDir);
        self.copy(sourceDir, projectDir, { dir: option.dir });
        if (option.update) {
          self.updatePackageFile(projectDir, { name, description });
        }
        utils.log(`init ${option.action} ${option.type === 'build' ? 'build template' : 'project'} ${name} successfully!`);
      }).catch(err => {
        console.log('init error', err);
      });
    }
  }
};