#!/usr/bin/env node

const pkg = require('./package.json')
const commander = require('commander')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const crypto = require('crypto')
const exec = require('child_process').execSync
const prompt = require('prompt')
const process = require('process')

const LogLevel = Object.freeze({
  'EE': 0,
  'FF': 1,
  'II': 2,
  'DD': 3,
})
const DEFAULT_LOG_LEVEL = LogLevel.FF

const DEFAULT_CONFIG_PATH = './.svs-blog-uploader-config.json'
const DEFAULT_TEMP_PATH = './temp'

const listParser = (val) => {
  return val.split(',')
}

const incVerbose = (val, total) => {
  return total + 1
}

const logPrint = function(level, currentVerbose, tag, msg) {
  if (currentVerbose >= level) {
    console.log(tag, msg)
  }
}

const fetchDefault = (givenValue, defaultValue) => {
  if (givenValue === undefined) {
    return defaultValue
  } else {
    return givenValue
  }
}

const fetchConfigFromFile = (path, configs) => {
  if (!fs.existsSync(path)) {
    return configs
  }
  let fileConfigs = JSON.parse(fs.readFileSync(path, 'utf8'))
  if (fileConfigs !== undefined) {
    return Object.assign(configs, fileConfigs)
  } else {
    return configs
  }
}

const genTimeRandomToken = () => {
  let timeStamp = (new Date()).getTime()
  let randomStr = crypto.randomBytes(32).toString('hex')
  return `${timeStamp}_${randomStr}`
}

const findOrBuildTempFolder = (outputPath) => {
  if (!fs.existsSync(outputPath)) {
    let result = mkdirp.sync(outputPath)
    console.log('mkdirp', result)
  }
}

const cloneSrcRepo = (configs) => {
  let cmd
  if (fs.existsSync(configs.srcRepoPath)) {
    cmd = `cd ${configs.srcRepoPath} && git pull origin posts`
  } else {
    cmd = `git clone ${configs.srcRepo} --branch posts --single-branch ${configs.srcRepoPath}`
  }
  exec(cmd, {
    encoding: 'utf8',
    stdio: 'inherit'
  })
}

const cloneDestRepo = (configs) => {
  let cmd
  if (fs.existsSync(configs.destRepoPath)) {
    cmd = `cd ${configs.destRepoPath} && git pull origin master`
  } else {
    cmd = `git clone ${configs.destRepo} --single-branch ${configs.destRepoPath}`
  }
  exec(cmd, {
    encoding: 'utf8',
    stdio: 'inherit'
  })
}

const runBuild = (configs) => {
  let cmd = `cd ${configs.srcRepoPath} && npm i && gulp clean && npm run build`
  exec(cmd, {
    encoding: 'utf8',
    stdio: 'inherit'
  })
}

const copySrcToDest = (configs) => {
  let distPath = path.join(configs.srcRepoPath, '/dist/*')
  let cmd = `
cp -rf ${distPath} ${configs.destRepoPath} &&
cd ${configs.destRepoPath} &&
git status
`
  exec(cmd, {
    encoding: 'utf8',
    stdio: 'inherit'
  })
}

const askAction = (configs) => {
  console.log('Choose the number of action to perform:')
  console.log('1. Upload changed files in posts/slides only.')
  console.log('2. Upload all changed files.')
  console.log('3. Abort and exit.')
  prompt.start()
  prompt.get({
    properties: {
      action: {
        pattern: /^[1-3]+$/,
        message: 'Please choose action from 1 - 3.',
        required: true
      }
    }
  }, (err, result) => {
    if (err) {
      console.log(err)
    }
    switch (result.action) {
      case '1':
        uploadChanges(configs)
        console.log('Done!!')
        break;
      case '2':
        uploadChanges(configs, true)
        console.log('Done!!')
        break;
      case '3':
        console.log('Abort!!')
        break;
      default:
        console.log(`Uknown action: ${result.action}!!`)
        process.exit(1)
    }
    console.log(`Source folder = ${configs.srcRepoPath}`)
    console.log(`Destination folder = ${configs.destRepoPath}`)
    process.exit(0)
  })
}

const uploadChanges = (configs, all = false) => {
  let cmd
  if (all) {
    cmd = `cd ${configs.destRepoPath} && git add ./ && git commit -v && git push origin master`
  } else {
    cmd = `cd ${configs.destRepoPath} && git add ./posts ./slides && git commit -v && git push origin master`
  }
  try {
    exec(cmd, {
      encoding: 'utf8',
      stdio: 'inherit'
    })
  } catch (err) {
    console.log(`Error: ${err}`)
  }
}

commander
  .version(pkg.version)
  .usage('[options] <title>')
  .option('-c, --config <path>',
    `The uploader config file path. The default is ${DEFAULT_CONFIG_PATH}`)
  .option('-t, --temp <path>',
    `The temp folder to prepare uploaded files. The default is ${DEFAULT_TEMP_PATH}`)
  .option('-s, --src <repo>',
    'The source repo.')
  .option('-d, --dest <repo>',
    'The destination repo.')
  .option('-v, --verbose',
    'Show verbose information.',
    incVerbose, DEFAULT_LOG_LEVEL)
  .parse(process.argv)

let verbose = commander.verbose

let configPath = fetchDefault(commander.config, DEFAULT_CONFIG_PATH)
let tempPath = fetchDefault(commander.temp, DEFAULT_TEMP_PATH)
let configs = {
  tempPath: tempPath,
  srcRepo: commander.src,
  destRepo: commander.dest
}

logPrint(LogLevel.DD, verbose, 'configPath', configPath)

configs = fetchConfigFromFile(configPath, configs)

if (configs.srcRepo === undefined) {
  console.log(`The source repo is not given.`)
  commander.help()
  process.exit(1)
}

if (configs.destRepo === undefined) {
  console.log(`The destination repo is not given.`)
  commander.help()
  process.exit(1)
}

let tempBuildPath = path.join(tempPath, `svs-uploader-build`)
configs['tempBuildPath'] = tempBuildPath
configs['srcRepoPath'] = path.join(tempBuildPath, path.basename(configs.srcRepo))
configs['destRepoPath'] = path.join(tempBuildPath, path.basename(configs.destRepo))

logPrint(LogLevel.DD, verbose, 'configs', configs)

findOrBuildTempFolder(tempBuildPath)
cloneSrcRepo(configs)
cloneDestRepo(configs)
runBuild(configs)
copySrcToDest(configs)
askAction(configs)
