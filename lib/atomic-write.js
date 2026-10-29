import fs from 'node:fs'

/** Replace only after a complete write; a failed write keeps the previous JSON. */
export function writeAtomic(file, text, io = fs) {
  const temporary = file + '.tmp'
  io.writeFileSync(temporary, text, 'utf8')
  io.renameSync(temporary, file)
}
