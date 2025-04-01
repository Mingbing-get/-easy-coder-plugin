# @easy-coder/plugin

### 安装

```bash
npm i @easy-coder/plugin -D
```

### 翻译插件

1. 说明
   该插件利用大模型将代码中的所有中文翻译成指定的语言。
   生成后的代码默认会从 localStorage 的'lang'中读取当前语言，若没有则读取浏览器的当前语言，若要实现切换语言，只需要切换后将语言存储到 localStorage 的'lang'中，然后执行刷新页面即可。
   若需要其他的存储逻辑，可修改打包后的 index.html 文件中的 Translate 代码。

2. 使用

```js
import { defineConfig } from 'vite'
import { vitePluginTranslateUseAi } from '@easy-coder/plugin'

export default defineConfig({
  plugins: [
    vitePluginTranslateUseAi({
      aiHost: 'xxx', // 大模型服务地址
      aiApiKey: 'xxx', // 大模型服务的api key
      aiModel: 'xxx', // 大模型服务的模型名称
      configFilePath: 'xxx.json', // 配置文件的路径(默认：translate.config.json; 这些配置也可以直接写到配置文件中，建议使用方式：将aiApiKey存放到配置文件中，并且不要上传到git中)
      translateFunctionName: 't', // 翻译函数的名称
      batchRequestCount: 500, // 批量请求的数量
      langFilePrefix: 'local', // 生成的语言文件的前缀
      cacheDir: './.cache/translate', // 缓存目录
      numberOfItem: 40, // 每次翻译的数据条数
      targetLanguageList: [
        'en',
        'ja',
        'af',
        'ar',
        'be',
        'bg',
        'bn',
        'ca',
        'cs',
        'cy',
        'da',
        'de',
        'el',
        'eo',
        'es',
        'et',
        'fa',
        'fi',
        'fr',
        'ga',
        'gl',
        'gu',
        'he',
        'hi',
        'hr',
        'ht',
        'hu',
        'id',
        'is',
        'it',
        'ka',
        'kn',
        'ko',
        'lt',
        'lv',
        'mk',
        'mr',
        'ms',
        'mt',
        'nl',
        'no',
        'pl',
        'pt',
        'ro',
        'ru',
        'sk',
        'sl',
        'sq',
        'sv',
        'sw',
        'ta',
        'te',
        'th',
        'tl',
        'tr',
        'uk',
        'ur',
        'vi',
      ], // 目标语言列表
    }),
  ],
})
```
