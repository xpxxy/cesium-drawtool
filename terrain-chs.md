# 地形服务 DEMO

当前 cesium 使用的地形瓦片格式为为 `quantized-mesh`  
该瓦片格式可以通过其他格式转换而来，旧版本 cesium 使用 `heightmap`

如使用天地图的三维地形服务，必须使用天地图特定版本的 cesium 版本，并引入官网示例的 js 文件，否则加载可能出错

以下内容为自部署地形瓦片服务

### 下载高程数据（DEM）

高程数据源比较多，任选一个使用。

本示例使用：[90mSRTM](https://srtm.csi.cgiar.org/)

### 瓦片数据转换

下载获得的`.tif` 文件可以使用以下库进行转换：

[Cesium Terrain Builder](https://github.com/geo-data/cesium-terrain-builder)  
[mago-3d-terrainer](https://github.com/Gaia3D/mago-3d-terrainer)

转换的过程可能较慢，还有可能报错，这里请根据对应文档自行解决。

转换文件后的文件内包含一个 `layer.json` 文件以及多个`.terrain` 文件

### 部署

任何服务都行，只需要需要确保目标地址目录下的文件能够被 `cesium` 访问

### 使用地形服务

一个简单示例：

```typescript
try {
	const terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl("YOUR TERRAIN SERVER URL")
	viewer.terrainProvider = terrainProvider
} catch (error) {
	console.error("加载地形出现错误", error)
}
```

### 常见问题

Q: 加载地形出现错误  
A: 请检查 `cesium` 访问目标地址的权限，以及目标地址的 `layer.json` 文件和 `.terrain` 文件是否正确

Q: 加载完地形看不见  
A: 检查 layer.json 文件的 看看区块的数据范围是否正确

### 地形服务优化

暂定 转换获得的地形文件在部分机器上运行性能表现可能不够好，需要优化
