# Terrain Service DEMO

Currently, Cesium uses the `quantized-mesh` format for terrain tiles.
This tile format can be converted from other formats. Older versions of Cesium used `heightmap`.

For CHS-User who is using Tianditu's 3D terrain service, you must use a specific version of Cesium provided by Tianditu and include the JS file from their official example, otherwise loading may fail.

The following content describes self-hosted terrain tile services.

### Download DEM Data

There are many sources of elevation data; choose any one to use.

This example uses: [90mSRTM](https://srtm.csi.cgiar.org/)

### Tile Data Conversion

The downloaded .tif file can be converted using the following libraries:

[Cesium Terrain Builder](https://github.com/geo-data/cesium-terrain-builder)  
[mago-3d-terrainer](https://github.com/Gaia3D/mago-3d-terrainer)

The conversion process might be slow and could potentially throw errors. Please refer to the respective documentation to resolve any issues.

After conversion, the output directory will contain a `layer.json` file and multiple `.terrain` files.

### Deployment

Any web server can be used. You just need to ensure that the files in the target directory are accessible to `Cesium`.

### Using the Terrain Service

a simple load example:

```typescript
try {
	const terrainProvider = await Cesium.CesiumTerrainProvider.fromUrl("YOUR TERRAIN SERVER URL")
	viewer.terrainProvider = terrainProvider
} catch (error) {
	console.error("Error loading terrain", error)
}
```

### QA

Q: Error loading terrain  
A: Please check the permissions of the `Cesium` access target address and ensure that the `layer.json` file and `.terrain` files are correct.

Q: Terrain not visible  
A: Please check the `layer.json` file to see if the data range of the blocks is correct.

### Terrain Service Optimization

TBD. The performance of the converted terrain files might not be optimal on some machines and may require optimization.
