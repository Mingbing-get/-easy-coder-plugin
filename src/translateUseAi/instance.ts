import { parse, resolve } from 'path'
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import OpenAI from 'openAi'
import { parse as babelParse } from '@babel/parser'
import traverse from '@babel/traverse'
import { createHash } from 'crypto'

import { TranslateUseAiOptions, CodeMark } from './type'

export class TranslateUseAi {
  static DEFAULT_CONFIG_FILE_PATH = 'translate.config.json'
  static PROCESS_FILE_NAME = 'process.json'
  static CACHE_FILE_NAME = 'lang.json'

  private options: Required<TranslateUseAiOptions>

  constructor(private inputOptions?: TranslateUseAiOptions) {
    this.options = {
      translateFunctionName: '$t',
      aiHost: '',
      aiApiKey: '',
      aiModel: '',
      assetsDir: 'assets',
      targetLanguageList: [],
      langFilePrefix: 'local',
      cacheDir: '.cache/translate',
      batchRequestCount: 100,
      numberOfItem: 200,
      configFilePath: TranslateUseAi.DEFAULT_CONFIG_FILE_PATH as any,
    }
  }

  async translate(willTranslateMap: Record<string, string>) {
    await this.initOptions()

    const fileWithCodeMark: {
      path: string
      codeMarks: CodeMark[]
    }[] = []
    for (const key in willTranslateMap) {
      const codeMarks = await this.getZhTextFromJsCode(willTranslateMap[key])
      fileWithCodeMark.push({
        path: key,
        codeMarks,
      })
    }

    const textList = fileWithCodeMark.reduce((total: string[], singleFile) => {
      singleFile.codeMarks.forEach((item) => {
        item.value.forEach((text) => {
          if (!total.includes(text)) {
            total.push(text)
          }
        })
      })

      return total
    }, [])

    textList.sort()

    const hash = createHash('md5')
    hash.update(JSON.stringify(textList))
    const contentHash = hash.digest('hex').substring(0, 8)

    const translateRes = await this.translateWithCache(textList)

    const willAddFiles: Record<string, string> = {}
    const translateAllLangMap: Record<string, Record<string, string>> = {}
    for (const lang in translateRes) {
      const translateMap: Record<string, string> = {}
      translateRes[lang].forEach((item, index) => {
        translateMap[`t_${index}`] = item
      })
      translateAllLangMap[lang] = translateMap
      willAddFiles[`${this.options.langFilePrefix}_${lang}_${contentHash}.json`] = JSON.stringify(translateMap)
    }
    const cacheDir = resolve(process.cwd(), this.options.cacheDir)
    await this.loopCreateDir(cacheDir)
    await writeFile(resolve(cacheDir, TranslateUseAi.CACHE_FILE_NAME), JSON.stringify(translateAllLangMap))

    const willUpdate: Record<string, string> = {}
    for (const singleFile of fileWithCodeMark) {
      let code = willTranslateMap[singleFile.path]

      singleFile.codeMarks.sort((pre, item) => item.start - pre.start)
      singleFile.codeMarks.forEach((item) => {
        const ids = item.value.map((text) => {
          const index = textList.indexOf(text)
          return `t_${index}`
        })
        code = code.slice(0, item.start) + item.getReplaceStr(ids) + code.slice(item.end)
      })

      willUpdate[singleFile.path] = code
    }

    return {
      willAddFiles,
      willUpdate,
      contentHash,
    }
  }

  getOptions() {
    return this.options
  }

  private async initOptions() {
    const configFilePath = resolve(process.cwd(), this.options?.configFilePath || TranslateUseAi.DEFAULT_CONFIG_FILE_PATH)
    let isMerge = false
    if (existsSync(configFilePath)) {
      const statInfo = await stat(configFilePath)
      if (statInfo.isFile()) {
        const configFileContent = await readFile(configFilePath, 'utf-8')
        const config: TranslateUseAiOptions = JSON.parse(configFileContent)

        this.options = {
          ...this.options,
          ...config,
          ...this.inputOptions,
        }
        isMerge = true
      }
    }

    if (!isMerge) {
      this.options = {
        ...this.options,
        ...this.inputOptions,
      }
    }

    if (!this.options.translateFunctionName) {
      throw new Error('translateFunctionName is required')
    }
    if (!this.options.aiHost) {
      throw new Error('aiHost is required')
    }
    if (!this.options.aiApiKey) {
      throw new Error('aiApiKey is required')
    }
    if (!this.options.aiModel) {
      throw new Error('aiModel is required')
    }
    if (!this.options.targetLanguageList || this.options.targetLanguageList.length === 0) {
      throw new Error('targetLanguageList is required')
    }
  }

  private async getZhTextFromJsCode(code: string) {
    const ast = babelParse(code, {
      sourceType: 'module',
    })
    const zhTextList: CodeMark[] = []
    traverse(ast, {
      StringLiteral: (path) => {
        const { value } = path.node
        const zhList = this.matchZh(value)

        if (zhList.length === 0) return

        zhTextList.push({
          value: zhList.map((item) => item.text),
          start: path.node.start || 0,
          end: path.node.end || 0,
          getReplaceStr: this.createGetReplaceStr(value, zhList),
        })
      },
      TemplateElement: (path) => {
        const { value } = path.node

        const zhList = this.matchZh(value.raw)

        if (zhList.length === 0) return

        zhTextList.push({
          value: zhList.map((item) => item.text),
          start: path.node.start || 0,
          end: path.node.end || 0,
          getReplaceStr: this.createGetReplaceStr(value.raw, zhList, true),
        })
      },
    })

    return zhTextList
  }

  private matchZh(text: string) {
    const res: { text: string; start: number }[] = []
    let startIndex = 0

    while (true) {
      const matchResult = text.match(/[\u4e00-\u9fa5]+/)
      if (!matchResult) break

      res.push({ text: matchResult[0], start: matchResult.index || 0 + startIndex })
      text = text.slice(matchResult.index || 0 + matchResult[0].length)
      startIndex += matchResult.index || 0 + matchResult[0].length
    }

    return res
  }

  private createGetReplaceStr(value: string, zhList: { text: string; start: number }[], isInTemplate: boolean = false) {
    return (ids: string[]) => {
      let replaceString = isInTemplate ? '' : '`'

      for (let i = 0; i < zhList.length; i++) {
        if (i === 0) {
          replaceString += value.slice(0, zhList[0].start).replace(/`/g, '\\`')
          if (this.isEnChart(replaceString, true)) {
            replaceString += ' '
          }
        }

        const afterStart = zhList[i].start + zhList[i].text.length
        const afterEnd = zhList[i + 1]?.start ?? value.length
        let afterStr = value.slice(afterStart, afterEnd).replace(/`/g, '\\`')
        if (this.isEnChart(afterStr)) {
          afterStr = ` ${afterStr}`
        }
        replaceString += `\${${this.options.translateFunctionName}("${ids[i]}")}${afterStr}`
      }

      return replaceString + (isInTemplate ? '' : '`')
    }
  }

  private async translateWithCache(textList: string[]): Promise<Record<string, string[]>> {
    const cachePath = resolve(process.cwd(), this.options.cacheDir, TranslateUseAi.CACHE_FILE_NAME)
    const cacheInfo: { langs: string[]; zhTexts: string[]; translateMap: Record<string, Record<string, string>> } = {
      langs: [],
      zhTexts: [],
      translateMap: {},
    }
    if (existsSync(cachePath)) {
      const cacheLangs: Record<string, Record<string, string>> = JSON.parse(await readFile(cachePath, 'utf-8'))
      cacheInfo.langs.push(...Object.keys(cacheLangs))
      cacheInfo.zhTexts = Object.values(cacheLangs.zh || [])

      for (const lang in cacheLangs) {
        if (lang === 'zh') continue

        cacheInfo.translateMap[lang] = {}
        for (const key in cacheLangs[lang]) {
          cacheInfo.translateMap[lang][cacheLangs.zh[key]] = cacheLangs[lang][key]
        }
      }
    }

    const missLang = this.options.targetLanguageList.filter((lang) => !cacheInfo.langs.includes(lang))
    const missTextLang = this.options.targetLanguageList.filter((lang) => lang !== 'zh' && !missLang.includes(lang))
    const missText = textList.filter((text) => !cacheInfo.zhTexts.includes(text))
    const translateRes: Record<string, string[]> = {
      zh: textList,
    }

    if (missLang.length > 0) {
      const missLangTranslate = await this.translateAll(textList, missLang)
      for (const lang in missLangTranslate) {
        translateRes[lang] = missLangTranslate[lang]
      }
    }

    const missTextTranslate: Record<string, string[]> = {}
    if (missTextLang.length > 0 && missText.length > 0) {
      const t = await this.translateAll(missText, missTextLang)
      for (const lang in t) {
        missTextTranslate[lang] = t[lang]
      }
    }

    for (const lang of missTextLang) {
      const thisLangText: string[] = []

      for (let i = 0; i < textList.length; i++) {
        const mt = missText.findIndex((text) => text === textList[i])
        if (mt !== -1) {
          thisLangText.push(missTextTranslate[lang][mt])
        } else {
          thisLangText.push(cacheInfo.translateMap[lang][textList[i]])
        }
      }

      translateRes[lang] = thisLangText
    }

    return translateRes
  }

  private async translateAll(textList: string[], targetLanguageList: string[]): Promise<Record<string, string[]>> {
    if (!targetLanguageList.length) {
      return {}
    }

    const res: Record<string, string[]> = {}

    targetLanguageList.forEach((lang) => {
      res[lang] = []
    })

    const batchCount = Math.max(1, Math.floor(this.options.numberOfItem / targetLanguageList.length))

    for (let i = 0; i < textList.length; i += batchCount * this.options.batchRequestCount) {
      /** @type { Promise<Record<string, string[]>>[] } */
      const allPromise = []
      for (let j = 0; j < this.options.batchRequestCount; j++) {
        const start = i + j * batchCount
        const end = i + (j + 1) * batchCount
        const batchTextList = textList.slice(start, end)
        if (batchTextList.length === 0) break

        console.log(`正在翻译第 ${start + 1} 条到第 ${end} 条`)
        const saveKey = `${start}_${end}`
        allPromise.push(this.retryAndCacheTranslate(saveKey, batchTextList, targetLanguageList))
      }

      const batchRes = await Promise.all(allPromise)
      batchRes.forEach((item) => {
        targetLanguageList.forEach((lang) => {
          res[lang].push(...item[lang])
        })
      })
    }

    const cachePath = resolve(process.cwd(), this.options.cacheDir, TranslateUseAi.PROCESS_FILE_NAME)
    if (existsSync(cachePath)) {
      await unlink(cachePath)
    }

    return res
  }

  private async retryAndCacheTranslate(saveKey: string, textList: string[], targetLanguageList: string[]): Promise<Record<string, string[]>> {
    const cachePath = resolve(process.cwd(), this.options.cacheDir, TranslateUseAi.PROCESS_FILE_NAME)
    let cacheInfo = existsSync(cachePath) ? JSON.parse(await readFile(cachePath, 'utf-8')) : {}

    if (cacheInfo[saveKey]) {
      console.log(`使用缓存: ${saveKey}`)
      return cacheInfo[saveKey]
    }

    await this.loopCreateDir(resolve(process.cwd(), this.options.cacheDir))
    const res = await this.retry(() => this.translateToRequest(textList, targetLanguageList))
    cacheInfo = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath).toString()) : {}
    cacheInfo[saveKey] = res
    writeFileSync(cachePath, JSON.stringify(cacheInfo))
    console.log(`成功: ${saveKey}`)

    return res
  }

  private async translateToRequest(textList: string[], targetLanguageList: string[]): Promise<Record<string, string[]>> {
    const prompt = `将以下列表翻译成: ${targetLanguageList.join(',')}, 结果以json返回, 例如: { "zh": ["你好", "世界"], "en": ["hello", "world"] }
  ${JSON.stringify(textList)}`

    const openAi = new OpenAI({
      apiKey: this.options.aiApiKey,
      baseURL: this.options.aiHost,
    })
    const res = await openAi.chat.completions.create({
      model: this.options.aiModel,
      messages: [{ role: 'user', content: prompt }],
    })

    const jsonList = this.matchJson(res.choices[0].message.content || '')
    if (jsonList.length === 0) {
      throw new Error('翻译失败')
    }

    const translateItem = jsonList.find((item) => this.isMultLangJson(item, targetLanguageList, textList.length))
    if (!translateItem) {
      throw new Error('未获取到符合条件的翻译结果')
    }

    return translateItem
  }

  private matchJson(text: string) {
    const reg = /```json\n([\s\S]*?)\n```/g

    const res: any[] = []
    const matchRes = text.match(reg)

    matchRes?.forEach((item) => {
      try {
        res.push(JSON.parse(item.substring(8, item.length - 4)))
      } catch (error) {}
    })

    return res
  }

  private isMultLangJson(value: any, langs: string[], count: number) {
    if (Object.prototype.toString.call(value) !== '[object Object]') return false

    for (const lang of langs) {
      if (!value[lang] || !Array.isArray(value[lang]) || value[lang].length !== count) return false

      for (const item of value[lang]) {
        if (typeof item !== 'string') return false
      }
    }

    return true
  }

  private isEnChart(str?: string, isCheckEnd: boolean = false) {
    if (!str) return false

    const chart = isCheckEnd ? str[str.length - 1] : str[0]
    return (chart >= 'a' && chart <= 'z') || (chart >= 'A' && chart <= 'Z')
  }

  private async loopCreateDir(dirPath: string) {
    /** @type { string[] } */
    const willCreateDirNames = []

    while (true) {
      if (existsSync(dirPath)) {
        const statInfo = await stat(dirPath)
        if (statInfo.isDirectory()) {
          break
        }
      }

      const pathInfo = parse(dirPath)
      willCreateDirNames.unshift(pathInfo.base)
      dirPath = pathInfo.dir
    }

    for (const dirName of willCreateDirNames) {
      dirPath = resolve(dirPath, dirName)
      await mkdir(dirPath)
    }
  }

  private async retry<T>(fn: () => Promise<T>, options: { times?: number; retryDelay?: number } = {}): Promise<T> {
    const { times = 5, retryDelay = 1000 } = options || {}

    let errorMsg = ''
    let i = 0
    while (i < times) {
      try {
        return await fn()
      } catch (error) {
        errorMsg = (error as any).message
        i++
      }

      await this.sleep(retryDelay)
    }

    throw new Error(errorMsg)
  }

  private async sleep(time: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, time)
    })
  }
}
