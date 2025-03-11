import type { Plugin } from 'vite'

import { resolve } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'

import { TranslateUseAiOptions } from './type'
import { TranslateUseAi } from './instance'

export default function vitePluginTranslateUseAi(options?: TranslateUseAiOptions) {
  let outDir: string = ''
  let createReplaceOptions: Omit<CreateReplaceOptions, 'scriptAttrMap'> = {
    translateFunctionName: '',
    contentHash: '',
    langFilePrefix: '',
  }

  const plugin: Plugin = {
    name: 'vite-plugin-translate-use-ai',
    async generateBundle(o, bundle) {
      console.log(`\n开始翻译...`)

      const willTranslateFileMap: Record<string, string> = {}

      for (const fileName in bundle) {
        const file = bundle[fileName]
        if (file.type === 'chunk' && fileName.endsWith('.js')) {
          willTranslateFileMap[fileName] = file.code
        }
      }

      const t = new TranslateUseAi(options)
      const { contentHash, willAddFiles, willUpdate } = await t.translate(willTranslateFileMap)
      createReplaceOptions = {
        translateFunctionName: t.getOptions().translateFunctionName,
        langFilePrefix: t.getOptions().langFilePrefix,
        contentHash,
      }

      for (const fileName in willUpdate) {
        const file = bundle[fileName]
        if (file?.type !== 'chunk') continue

        file.code = willUpdate[fileName]
      }

      for (const fileName in willAddFiles) {
        const filePath = `${t.getOptions().assetsDir}/${fileName}`
        bundle[filePath] = {
          type: 'asset',
          source: willAddFiles[fileName],
          fileName: filePath,
          name: fileName,
        } as any
      }

      console.log(`\n翻译完成...`)
    },

    configResolved(config) {
      outDir = config.build.outDir
    },

    async writeBundle() {
      const htmlFilePath = resolve(process.cwd(), outDir, 'index.html')
      if (!existsSync(htmlFilePath)) return

      const matchScriptReg = /<script[^>]*src=["'][^"']*["'][^>]*>.*?<\/script>/
      const matchAttrReg = /(\w+)(?:=(["'])(.*?)\2)?(?=\s|>)/g
      const html = await readFile(htmlFilePath, 'utf-8')

      const matchRes = html.match(matchScriptReg)
      if (!matchRes) return

      const scriptContent = matchRes[0]
      const attrRes = scriptContent.match(matchAttrReg)?.filter((item) => item !== 'script') || []
      const attrMap: Record<string, any> = {}
      attrRes.forEach((item) => {
        const [key, value] = item.split('=')
        if (value === undefined) {
          attrMap[key] = true
        } else {
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            attrMap[key] = value.slice(1, value.length - 1)
          } else {
            attrMap[key] = value
          }
        }
      })

      const newHtml = html.replace(scriptContent, createReplaceHtmlScript({ ...createReplaceOptions, scriptAttrMap: attrMap }))
      await writeFile(htmlFilePath, newHtml, 'utf-8')
    },
  }

  return plugin
}

interface CreateReplaceOptions extends Required<Pick<TranslateUseAiOptions, 'langFilePrefix' | 'translateFunctionName'>> {
  contentHash: string
  scriptAttrMap: Record<string, string>
}
function createReplaceHtmlScript({ langFilePrefix, translateFunctionName, contentHash, scriptAttrMap }: CreateReplaceOptions) {
  return `<script>
  (() => {
    class Translate {
      static SUPPORT_LANG_MAP = {
        en: '英语',
        zh: '中文',
        af: '南非荷兰语',
        ar: '阿拉伯语',
        be: '白俄罗斯语',
        bg: '保加利亚语',
        bn: '孟加拉语',
        ca: '加泰罗尼亚语',
        cs: '捷克语',
        cy: '威尔士语',
        da: '丹麦语',
        de: '德语',
        el: '希腊语',
        eo: '世界语',
        es: '西班牙语',
        et: '爱沙尼亚语',
        fa: '波斯语',
        fi: '芬兰语',
        fr: '法语',
        ga: '爱尔兰语',
        gl: '加利西亚语',
        gu: '古吉拉特语',
        he: '希伯来语',
        hi: '北印度语',
        hr: '克罗地亚语',
        ht: '海地语',
        hu: '匈牙利语',
        id: '印度尼西亚语',
        is: '冰岛语',
        it: '意大利语',
        ja: '日语',
        ka: '格鲁吉亚语',
        kn: '卡纳达语',
        ko: '韩语',
        lt: '立陶宛语',
        lv: '拉脱维亚语',
        mk: '马其顿语',
        mr: '马拉地语',
        ms: '马来语',
        mt: '马耳他语',
        nl: '荷兰语',
        no: '挪威语',
        pl: '波兰语',
        pt: '葡萄牙语',
        ro: '罗马尼亚语',
        ru: '俄语',
        sk: '斯洛伐克语',
        sl: '斯洛文尼亚语',
        sq: '阿尔巴尼亚语',
        sv: '瑞典语',
        sw: '斯瓦希里语',
        ta: '泰米尔语',
        te: '泰卢固语',
        th: '泰语',
        tl: '塔加路语',
        tr: '土耳其语',
        uk: '乌克兰语',
        ur: '乌尔都语',
        vi: '越南语',
      }

      options

      langCode

      langMap = {}

      constructor(options) {
        this.options = options || {}
        this.langCode = this.getBrowserLangCode()

        this.init()
      }

      async init() {
        if (this.options.getCurrentLang) {
          const langCode = await this.options.getCurrentLang()
          if (langCode) {
            this.langCode = langCode
          }
        }

        const langUrl = this.options.getLangUrl?.(this.langCode)
        if (!langUrl) {
          throw new Error(\`未获取到语言文件地址：\${this.langCode}\`)
        }

        const res = await fetch(langUrl, {
          method: 'GET',
          mode: 'cors',
        })
        this.langMap = await res.json()

        this.options.initComplete?.()
      }

      translate(key) {
        return this.langMap[key]
      }

      getLangCode() {
        return this.langCode
      }

      getBrowserLangCode() {
        const lang = navigator.language

        for (const key in Translate.SUPPORT_LANG_MAP) {
          if (lang.startsWith(key)) return key
        }

        return 'zh'
      }

      getSupportLangMap() {
        return Translate.SUPPORT_LANG_MAP
      }
    }

    const t = new Translate({
      getLangUrl: (lang) => \`/assets/${langFilePrefix}_\${lang}_${contentHash}.json\`,
      getCurrentLang: () => localStorage.getItem('lang'),
      initComplete: () => {
        const script = document.createElement('script')
        const attrMap = JSON.parse('${JSON.stringify(scriptAttrMap)}')
        for (const key in attrMap) {
          script.setAttribute(key, attrMap[key])
        }
        document.head.appendChild(script)
      }
    })
    window.${translateFunctionName} = (key) => t.translate(key)
  })()
</script>`
}
