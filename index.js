#!/usr/bin/env node

const chalk = require('chalk')
const inquirer = require('inquirer')

module.exports = function instantResume (
  resumePath = './resume.json',
  {
    greeting = '',
    seperator = '--------------------------------------',
    seperatorColor = 'cyan'
  } = {}
) {
  const resume = require(resumePath)

  const prompt = {
    type: 'list',
    name: 'answer',
    message: 'What would you like to know?',
    choices: [...Object.keys(resume), 'Exit']
  }

  const exitPrompt = {
    type: 'list',
    name: 'exitBack',
    message: 'Go back or Exit?',
    choices: ['Back', 'Exit']
  }

  function handler () {
    inquirer.prompt(prompt).then(({ answer }) => {
      if (answer.toLowerCase() === 'Exit') {
        return
      }

      if (resume[`${answer}`]) {
        console.log(chalk.bold[seperatorColor](seperator))
        resume[`${answer}`].forEach(info => {
          console.log(chalk.bold(info))
        })
        console.log(chalk.bold[seperatorColor](seperator))
      }

      inquirer.prompt(exitPrompt).then(choice => {
        if (choice.exitBack === 'Back') {
          handler()
        }
      })
    })
  }

  if (greeting) {
    console.log(greeting)
  }

  handler()
}
