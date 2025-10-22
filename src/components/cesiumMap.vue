<template>
    <div id="mapContainer">
        <div class="user-pannel">
            <div class="user-pannel-item">
                <div class="user-pannel-item-title">绘制工具</div>
                <el-checkbox v-model="toolStatus" @change="handleToolActivate">激活</el-checkbox>
                <el-checkbox v-model="editStatus" @change="handleEditActivate">编辑模式</el-checkbox>
                <el-select class="custom-select" v-model="toolEditMode" :disabled="toolStatus !== true"
                    placeholder="请选择编辑类型">
                    <el-option label="自定义多边形作业区" value="polygonWorkZone"></el-option>
                    <el-option label="自定义多边形限飞区" value="polygonLimitZone"></el-option>
                    <el-option label="自定义多边形禁降区" value="polygonForbiddenZone"></el-option>
                    <el-option label="自定义圆形作业区" value="circleWorkZone"></el-option>
                    <el-option label="自定义圆形限飞区" value="circleLimitZone"></el-option>
                    <el-option label="自定义圆形禁降区" value="circleForbiddenZone"></el-option>
                </el-select>

            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
import * as Cesium from "cesium"
import { cesiumToken } from "../main"
import { DrawTool } from "./mapUtility/DrawTool.ts"

let viewer: Cesium.Viewer
//初始坐标 使用WGS84 该坐标为
const initialCoordinate = {
    longitude: 120.209903,
    latitude: 30.246566,
    height: 10000,
}

let drawTool: DrawTool


async function initMap() {
    Cesium.Ion.defaultAccessToken = cesiumToken
    viewer = new Cesium.Viewer("mapContainer", {
        shouldAnimate: true, //动画
        selectionIndicator: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        timeline: false,
        navigationHelpButton: false,
        navigationInstructionsInitiallyVisible: false,
        showRenderLoopErrors: false,
        shadows: false,
        animation: false,
    })
    drawTool = new DrawTool(viewer)

    //@ts-expect-error style issue but work properly
    viewer.cesiumWidget.creditContainer.style.display = 'none' // 隐藏版权信息
    // 抗锯齿
    viewer.scene.msaaSamples = 4
    viewer.scene.postProcessStages.fxaa.enabled = false
    // 水雾特效
    viewer.scene.globe.showGroundAtmosphere = false
    // 设置最大俯仰角，[-90,0]区间内，默认为-30，单位弧度
    // viewer.scene.screenSpaceCameraController.constrainedPitch = Cesium.Math.toRadians(-20)
    // viewer.scene.screenSpaceCameraController.autoResetHeadingPitch = false
    viewer.scene.screenSpaceCameraController.inertiaZoom = 0.5
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 50
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 20000000

    //启用深度检测
    viewer.scene.globe.depthTestAgainstTerrain = true

    // 取消默认的双击事件
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
        Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    )

    //*加载 3d-tiles 地形 服务来自 cesium 或者 来自天地图
    try {
        const terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1)
        viewer.terrainProvider = terrainProvider
    } catch (error) {
        console.log('加载地形出现错误', error)
    }


    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
            initialCoordinate.longitude,
            initialCoordinate.latitude,
            initialCoordinate.height,
        ),
        orientation: {
            heading: Cesium.Math.toRadians(348.4202942851978),
            pitch: Cesium.Math.toRadians(-90),
            roll: Cesium.Math.toRadians(0),
        },
    })


}

const toolStatus = ref(false)
const editStatus = ref(false)
const toolEditMode = ref('polygonWorkZone')

onMounted(() => {
    initMap()
})

function handleToolActivate(status: any) {
    if (status) {
        switch (toolEditMode.value) {
            case 'polygonWorkZone':
                drawTool?.drawPolygon('workZone', (res: any) => {
                    console.log('', res);
                })
                break;
            case 'polygonLimitZone':
                break;
            case 'polygonForbiddenZone':
                break;
            case 'circleWorkZone':
                break;
            case 'circleLimitZone':
                break;
            case 'circleForbiddenZone':
                break;
        }


    } else {
        drawTool?.stopDraw()
    }
}

function handleEditActivate(status: any) {
    if (status) {
        drawTool?.stopDraw()
        drawTool?.editPolygon('workZone', (res: any) => {
            console.log('最后的结果', res);
        })
    } else {
        drawTool?.stopDraw()
    }
}



function drawPoint() {
    drawTool?.pickPoint((res => {
        console.log(res)
    }));
}





</script>

<style scoped>
#mapContainer {
    width: 100%;
    height: 100%;
    position: relative;
}

.user-pannel {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1000;
    width: 200px;
    height: 200px;
    padding: 5px;
    background-color: aliceblue;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
}
</style>
