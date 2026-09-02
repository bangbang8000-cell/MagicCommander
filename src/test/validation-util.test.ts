/**
 * 4.5.0（F5-1 ~ F5-3）校验引擎前端 util 单测（纯函数，D-1/D-2/D-3 前端对照）
 */
import { describe, it, expect } from 'vitest'
import {
  validateConsistency,
  validateOutput,
  validateIp,
  runProjectValidation,
  reportToJson,
  isIPv4,
  parsePrefix,
  subnetsOverlap,
  type ProjectData,
} from '@/utils/validation'

function healthyData(): ProjectData {
  return {
    project: 'demo',
    paraRows: [{ 工作簿名称: 'hostname.xlsx', 工作表名称: '主机表', 工作表类型: '赋值表', 对称列数: 0, key列数: 1 }],
    sheets: [
      {
        file: 'hostname.xlsx',
        sheet: '主机表',
        headers: ['设备名', '角色', '管理IP'],
        rows: [{ 设备名: 'SW-01', 角色: 'ASW', 管理IP: '192.168.1.1' }],
      },
    ],
    templates: [{ name: 'ASW.j2', content: 'hostname {{ info["设备名"] }}\n' }],
    outputDevices: [{ name: 'SW-01', role: 'ASW' }],
    outputBatch: '2026_09_02_10_00_00',
    hasOutput: true,
  }
}

describe('validateConsistency（F5-1 参数表/模板/字段）', () => {
  it('健康项目通过', () => {
    const report = validateConsistency(healthyData())
    expect(report.ok).toBe(true)
    expect(report.issues).toEqual([])
  })

  it('project_para 为空 → error 且含定位', () => {
    const data = { ...healthyData(), paraRows: [] }
    const report = validateConsistency(data)
    expect(report.ok).toBe(false)
    const e = report.issues.find((i) => i.severity === 'error')
    expect(e?.message).toContain('project_para')
    expect(e?.location).toContain('para.xlsx')
    expect(typeof e?.suggestion).toBe('string')
  })

  it('缺少必填列 → error', () => {
    const data = {
      ...healthyData(),
      paraRows: [{ 工作簿名称: 'hostname.xlsx' }],
    }
    const report = validateConsistency(data)
    expect(report.issues.some((i) => i.severity === 'error' && i.message.includes('缺少必填列'))).toBe(true)
  })

  it('非法工作表类型 → error', () => {
    const data = {
      ...healthyData(),
      paraRows: [{ 工作簿名称: 'hostname.xlsx', 工作表名称: '主机表', 工作表类型: '非法', 对称列数: 0, key列数: 1 }],
    }
    const report = validateConsistency(data)
    expect(report.issues.some((i) => i.message.includes('工作表类型'))).toBe(true)
  })

  it('引用的工作表不存在 → error', () => {
    const data = {
      ...healthyData(),
      paraRows: [{ 工作簿名称: 'missing.xlsx', 工作表名称: '表', 工作表类型: '赋值表', 对称列数: 0, key列数: 1 }],
    }
    const report = validateConsistency(data)
    expect(report.issues.some((i) => i.message.includes('不存在'))).toBe(true)
  })

  it('角色缺模板 → error', () => {
    const data = {
      ...healthyData(),
      sheets: [
        {
          file: 'hostname.xlsx',
          sheet: '主机表',
          headers: ['设备名', '角色'],
          rows: [{ 设备名: 'SW-01', 角色: 'CORE' }],
        },
      ],
      templates: [],
    }
    const report = validateConsistency(data)
    expect(report.issues.some((i) => i.severity === 'error' && i.message.includes('CORE'))).toBe(true)
  })

  it('模板引用缺失字段 → warning', () => {
    const data = {
      ...healthyData(),
      templates: [{ name: 'ASW.j2', content: '{{ info["不存在的字段"] }}' }],
    }
    const report = validateConsistency(data)
    expect(report.issues.some((i) => i.severity === 'warning' && i.message.includes('不存在的字段'))).toBe(true)
  })

  it('非法管理 IP → error', () => {
    const data = {
      ...healthyData(),
      sheets: [
        {
          file: 'hostname.xlsx',
          sheet: '主机表',
          headers: ['设备名', '角色', '管理IP'],
          rows: [{ 设备名: 'SW-01', 角色: 'ASW', 管理IP: '999.1.1.1' }],
        },
      ],
    }
    const report = validateConsistency(data)
    expect(report.issues.some((i) => i.severity === 'error' && i.message.includes('IPv4'))).toBe(true)
  })
})

describe('validateOutput（F5-2 导出数据核对）', () => {
  it('无渲染批次 → warning', () => {
    const data = { ...healthyData(), hasOutput: false, outputDevices: [] }
    const report = validateOutput(data)
    expect(report.issues.some((i) => i.severity === 'warning' && i.message.includes('没有渲染批次'))).toBe(true)
  })

  it('数量不一致 → error', () => {
    const data = {
      ...healthyData(),
      sheets: [
        {
          file: 'hostname.xlsx',
          sheet: '主机表',
          headers: ['设备名', '角色'],
          rows: [
            { 设备名: 'SW-01', 角色: 'ASW' },
            { 设备名: 'SW-02', 角色: 'ASW' },
          ],
        },
      ],
      outputDevices: [{ name: 'SW-01', role: 'ASW' }],
    }
    const report = validateOutput(data)
    expect(report.issues.some((i) => i.severity === 'error' && i.message.includes('设备数'))).toBe(true)
  })

  it('产物缺失设备 → error', () => {
    const data = {
      ...healthyData(),
      sheets: [
        {
          file: 'hostname.xlsx',
          sheet: '主机表',
          headers: ['设备名', '角色'],
          rows: [
            { 设备名: 'SW-01', 角色: 'ASW' },
            { 设备名: 'SW-02', 角色: 'ASW' },
          ],
        },
      ],
      outputDevices: [{ name: 'SW-01', role: 'ASW' }],
    }
    const report = validateOutput(data)
    expect(report.issues.some((i) => i.message.includes('缺失设备') && i.message.includes('SW-02'))).toBe(true)
  })

  it('产物多余设备 → warning', () => {
    const data = {
      ...healthyData(),
      outputDevices: [
        { name: 'SW-01', role: 'ASW' },
        { name: 'SW-99', role: 'ASW' },
      ],
    }
    const report = validateOutput(data)
    expect(report.issues.some((i) => i.severity === 'warning' && i.message.includes('参数表外设备'))).toBe(true)
  })

  it('健康渲染批次通过', () => {
    const report = validateOutput(healthyData())
    expect(report.ok).toBe(true)
  })
})

describe('validateIp（F5-3 IP 规划校验）', () => {
  it('重复分配 → error', () => {
    const data: ProjectData = {
      ...healthyData(),
      sheets: [
        {
          file: 'ipaddress.xlsx',
          sheet: '网关地址表',
          headers: ['网关IP', '网关掩码'],
          rows: [
            { 网关IP: '192.168.1.1', 网关掩码: 24 },
            { 网关IP: '192.168.1.1', 网关掩码: 24 },
          ],
        },
      ],
    }
    const report = validateIp(data)
    expect(report.issues.some((i) => i.severity === 'error' && i.message.includes('重复分配'))).toBe(true)
  })

  it('非法掩码 → error', () => {
    const data: ProjectData = {
      ...healthyData(),
      sheets: [
        {
          file: 'ipaddress.xlsx',
          sheet: '网关地址表',
          headers: ['网关IP', '网关掩码'],
          rows: [{ 网关IP: '192.168.1.1', 网关掩码: 33 }],
        },
      ],
    }
    const report = validateIp(data)
    expect(report.issues.some((i) => i.severity === 'error' && i.message.includes('掩码非法'))).toBe(true)
  })

  it('子网重叠 → error', () => {
    const data: ProjectData = {
      ...healthyData(),
      sheets: [
        {
          file: 'subnet.xlsx',
          sheet: '网段表',
          headers: ['网段'],
          rows: [{ 网段: '192.168.1.0/24' }, { 网段: '192.168.1.0/25' }],
        },
      ],
    }
    const report = validateIp(data)
    expect(report.issues.some((i) => i.severity === 'error' && i.message.includes('子网重叠'))).toBe(true)
  })

  it('无 IP 字段 → info 不阻断', () => {
    const data: ProjectData = {
      ...healthyData(),
      sheets: [
        {
          file: 'hostname.xlsx',
          sheet: '主机表',
          headers: ['设备名', '角色'],
          rows: [{ 设备名: 'SW-01', 角色: 'ASW' }],
        },
      ],
    }
    const report = validateIp(data)
    expect(report.ok).toBe(true)
    expect(report.issues.some((i) => i.severity === 'info')).toBe(true)
  })

  it('健康 IP 规划通过', () => {
    const data: ProjectData = {
      ...healthyData(),
      sheets: [
        {
          file: 'ipaddress.xlsx',
          sheet: '网关地址表',
          headers: ['网关IP', '网关掩码'],
          rows: [{ 网关IP: '192.168.1.1', 网关掩码: 24 }],
        },
      ],
    }
    const report = validateIp(data)
    expect(report.ok).toBe(true)
  })
})

describe('runProjectValidation / 序列化', () => {
  it('all 汇总三类校验 + 汇总统计', () => {
    const report = runProjectValidation(healthyData(), 'all')
    expect(report.scope).toBe('all')
    expect(report.checks.length).toBeGreaterThanOrEqual(3)
    expect(report.summary.total).toBe(report.issues.length)
    expect(report.summary.errors).toBe(report.issues.filter((i) => i.severity === 'error').length)
  })

  it('reportToJson 可解析且字段完整', () => {
    const json = reportToJson(validateConsistency(healthyData()))
    const parsed = JSON.parse(json)
    expect(parsed).toHaveProperty('ok')
    expect(parsed).toHaveProperty('summary')
    expect(parsed).toHaveProperty('issues')
  })
})

describe('IP 工具函数', () => {
  it('isIPv4', () => {
    expect(isIPv4('192.168.1.1')).toBe(true)
    expect(isIPv4('999.1.1.1')).toBe(false)
    expect(isIPv4('')).toBe(false)
  })

  it('parsePrefix', () => {
    expect(parsePrefix('24')).toBe(24)
    expect(parsePrefix('255.255.255.0')).toBe(24)
    expect(parsePrefix('33')).toBeNull()
  })

  it('subnetsOverlap', () => {
    expect(subnetsOverlap('192.168.1.0', 24, '192.168.1.128', 25)).toBe(true)
    expect(subnetsOverlap('192.168.1.0', 24, '192.168.2.0', 24)).toBe(false)
  })
})
