export interface TranslateUseAiOptions {
  translateFunctionName?: string
  aiHost?: string
  aiApiKey?: string
  aiModel?: string
  targetLanguageList?: string[]
  langFilePrefix?: string
  cacheDir?: string
  batchRequestCount?: number
  numberOfItem?: number
  assetsDir?: string
  configFilePath?: `${string}.json`
}

export interface CodeMark {
  value: string[]
  start: number
  end: number
  getReplaceStr: (ids: string[]) => string
}
