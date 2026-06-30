/**
 * 网络工程师名言库
 * 用于加载页面展示
 */
export const NETWORK_QUOTES = [
  // 技术类
  '网络的世界里，没有到达不了的远方，只有找不到的路由。',
  '配置一行代码，省去一夜排错。',
  '好的网络架构，是让故障发生在测试环境。',
  'IP分片不怕难，MTU限制记心间。',
  '路由协议选得好，网络稳定没烦恼。',
  'ACL写得好，访问控制没烦恼。',
  'VLAN划得清，网络隔离才安心。',
  '冗余链路不能少，故障切换才可靠。',
  '日志分析做得好，问题定位快又准。',
  '协议抓包是个宝，疑难杂症难不倒。',

  // 经验类
  '备份配置是底线，手动变更要留痕。',
  '变更之前先沟通，变更之后速验证。',
  '生产环境动不得，测试环境随便搞。',
  '三层架构记心间，接入汇聚核心层。',
  '防火墙是第一道，也是最后一道。',
  'NAT虽好别滥用，地址规划要提前。',
  'DHCP服务要冗余，地址池要留余量。',
  'DNS是网络基石，解析故障全网瘫。',
  '时区统一很重要，日志分析用得到。',

  // 工具类
  'Ping一下能通否，初步判断网络通。',
  'Tracert走一遍，路由路径看得见。',
  'Telnet测端口，服务连通心里有。',
  'Snmp监控配一套，告警及时才可靠。',
  '备份脚本跑起来，数据安全有保障。',

  // 心态类
  '网络无小事，责任重于山。',
  '排错要细心，一步一步来。',
  '文档写得好，接手没烦恼。',
  '经验靠积累，问题促成长。',
  '入行先入坑，坑多路更宽。',

  // 幽默类
  '世界上最远的距离，不是天涯海角，而是网关不通。',
  '我以为我的配置没问题，直到ping了一下。',
  '为什么掉线了？因为机房空调坏了。',
  '加班到凌晨，只因一根网线没插好。',
  '甲方说简单改一下，我改了一整夜。',

  // 进阶类
  'SDN时代已来临，传统网络要转型。',
  '容器网络要搞懂，Overlay不可少。',
  'IPv6过渡要平滑，双栈部署是方向。',
  '零信任安全新理念，持续验证是核心。',
  '自动化运维是趋势，Ansible要来助力。',
]

/**
 * 获取随机名言（不重复）
 */
const usedIndices = new Set<number>()

export function getRandomQuote(): { quote: string; index: number } {
  // 如果都用过了，重置
  if (usedIndices.size >= NETWORK_QUOTES.length) {
    usedIndices.clear()
  }

  let index: number
  do {
    index = Math.floor(Math.random() * NETWORK_QUOTES.length)
  } while (usedIndices.has(index))

  usedIndices.add(index)
  return { quote: NETWORK_QUOTES[index], index }
}

/**
 * 重置名言索引（每次启动时调用）
 */
export function resetQuoteIndex(): void {
  usedIndices.clear()
}
