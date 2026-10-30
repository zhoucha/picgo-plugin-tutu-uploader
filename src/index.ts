import { PicGo } from 'picgo'
import { IPluginConfig  } from 'picgo/dist/utils/interfaces'
import { URL } from 'url'

// Define the IWechatConfig interface according to your config structure
const CONFIG_NAME = 'picgo-plugin-tutu-uploader'

interface ITutuConfig {
  apiKey: string
}

// 常见图片扩展名 -> MIME 类型映射，用于 multipart 上传时的 contentType 声明
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
}
export = (ctx: PicGo) => {

  const config = (): IPluginConfig[] => {
    return [
      {
        name: 'apiKey',
        type: 'input',
        message: '获取教程：https://tutu.to/docs/api-v2',
        required: true
      }
    ]
  }
  

  const handleUpload = async (ctx: PicGo): Promise<boolean> => {
    try {
      // GUI 图床配置面板将本上传器的配置保存在 picBed.<CONFIG_NAME>
      const userConfig = ctx.getConfig<ITutuConfig>(`picBed.${CONFIG_NAME}`)
      if (!userConfig) {
        ctx.log.error('未获取到兔兔图床配置')
        throw new Error('未获取到兔兔图床配置')
      }
      const { apiKey } = userConfig

      // 处理所有图片
      for (const img of ctx.output) {
        // 检查图片大小
        const imageSizeMB = img.buffer.length / (1024 * 1024)
        if (imageSizeMB > 10) {
          throw new Error(`图片大小 ${imageSizeMB.toFixed(2)}MB 超过限制 10MB`)
        }
        // 上传到兔兔图床
        ctx.log.info('upload :', img.fileName, img.extname, img.buffer.length, 'bytes');
        const mimeType = MIME_MAP[(img.extname || '').toLowerCase()] || 'image/png'
        const rawResponse: any = await ctx.request({
          url: `https://tutu.to/api/2/upload`,
          method: 'POST',
          headers: {
               'Authorization': `Bearer ${apiKey}`
          },
           formData: {
            source: {
              value: img.buffer,
              options: {
                filename: img.fileName,
                contentType: mimeType
              }
            }
          },
        })
        // request 库可能返回字符串或已解析对象，统一处理为对象
        const uploadResponse: any = typeof rawResponse === 'string' ? JSON.parse(rawResponse) : rawResponse
        ctx.log.info('兔兔图床上传响应',uploadResponse)
        //{"image":{"album_id":null,"chain":7,"direct_url":"https://t.tutu.to/img/eiDM","extension":"png","height":213,"id":"eiDM","mime":"image/png","name":"image-20261030093053232","url_preview":"https://t.tutu.to/img/eiDM","url_viewer":"https://tutu.to/image/eiDM","visibility":"public","width":931},"status_code":200,"success":{"code":200,"message":"image uploaded"}} 
        if (uploadResponse.status_code !== 200) {
          throw new Error(`上传失败: ${uploadResponse.success.message}`)
        }
        const rawUrl = `https://t.tutu.to/dl/${uploadResponse.image.id}`
        if (!rawUrl) {
          throw new Error(`兔兔图床返回的URL为空: ${uploadResponse?.success?.message || '未知响应'}`)
        }
        // // 保存结果（接口返回 http 链接，统一升级为 https 以便 Typora/网页外链使用）
        img.imgUrl = rawUrl.replace(/^http:\/\//, 'https://')
        img.fullResult = uploadResponse
      }
      return true
    } catch (err: any) {
      ctx.log.error('兔兔图床上传失败', err)
      ctx.emit('notification', {
        title: '兔兔图床错误',
        body: err.message || '未知错误'
      })
      return false
    }
  }

  

  const handleAfterUpload = async (ctx: PicGo): Promise<boolean> => {
    try {
      // afterUploadPlugins 对所有图床都会执行，仅在当前使用本图床时才处理，避免改写其他图床的上传结果
      const currentUploader = ctx.getConfig<string>('picBed.uploader') || ctx.getConfig<string>('picBed.current')
      if (currentUploader !== CONFIG_NAME) {
        ctx.log.info(`当前使用非 兔兔图床，不处理上传后逻辑`)
        return true
      }
      ctx.log.info('兔兔图床上传完成')
      // 为本图床的上传结果补充 Markdown 格式字段
      for (const img of ctx.output) {
        if (img.imgUrl) {
          img.markdown = `![](${img.imgUrl})`
          ctx.log.info('兔兔图床上传完成，图片URL:', img.imgUrl)
        }
      }
    } catch (err: any) {
      ctx.log.error('上传后处理失败', err)
    }
    return true
  }

  const register = (): void => {
    ctx.helper.uploader.register(CONFIG_NAME, {
      name: '兔兔图床',
      handle: handleUpload,
      config: config,
      
    })
    // 不注册 transformer：使用默认 transformer（path）即可读取本地图片，避免选到空 transformer 导致上传失败
    ctx.helper.beforeTransformPlugins.register(CONFIG_NAME, {
      handle (ctx) {

      }
    })
    ctx.helper.beforeUploadPlugins.register(CONFIG_NAME, {
      handle (ctx) {

      }
    })
    ctx.helper.afterUploadPlugins.register(CONFIG_NAME, {
      handle: handleAfterUpload
    })
  }
  return {
    uploader: CONFIG_NAME,
    register
  }
}
