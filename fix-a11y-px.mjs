import fs from 'fs'
import path from 'path'

function getFiles(dir) {
  let results = []
  const list = fs.readdirSync(dir)
  list.forEach(file => {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat && stat.isDirectory() && !fullPath.includes('node_modules')) {
      results = results.concat(getFiles(fullPath))
    } else if (file.endsWith('.tsx')) {
      results.push(fullPath)
    }
  })
  return results
}

const files = [...getFiles('app'), ...getFiles('components')]
let count = 0

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  
  const newContent = content.replace(/text-\[(\d+(?:\.\d+)?)px\]/g, (match, p1) => {
    const px = parseFloat(p1)
    const rem = (px / 16).toFixed(4).replace(/\.?0+$/, '')
    return `text-[${rem}rem]`
  })
  
  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf8')
    count++
  }
}

console.log(`Updated ${count} files with rem values for typography.`)
