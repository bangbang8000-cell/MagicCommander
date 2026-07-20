# 从模板中心创建项目

## 触发条件
用户要求创建项目，且指定了设备类型和厂商。

## 执行步骤
1. 如果未提供项目名，先询问
2. 调用 create_project_intelligent(deviceType, vendor, projectName)
3. 展示项目结构和模板预览

## 注意事项
- **不要使用 create_project**，模板中心模板只能用 create_project_intelligent
- "华为交换机" → deviceType="switch", vendor="huawei"
- "思科路由器" → deviceType="router", vendor="cisco"