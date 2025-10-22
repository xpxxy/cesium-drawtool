import * as Cesium from "cesium"
import {
	Cartesian3ToWgs84,
	getDotStyle,
	getRandomId,
	getZoneLabelStyle,
	getZoneStyle,
} from "./utils"
import type { Wgs84Coordinate, ZoneType } from "./types"
import { ElMessage } from "element-plus"

export class DrawTool {
	private viewer: Cesium.Viewer //全局的cesium viewer 创建时传入
	private _handler: Cesium.ScreenSpaceEventHandler | undefined //一定会有 没有会自动创建
	private entites: Cesium.Entity[] = []
	private drawSource!: Cesium.DataSource //一定会有 没有则自动创建
	private drawing: boolean = false
	constructor(viewer: Cesium.Viewer) {
		this.viewer = viewer
		// 创建或获取自定义数据集 统一管理 绘制
		const customSource = viewer.dataSources.getByName("drawSource")
		if (customSource.length === 0 || !customSource) {
			this.drawSource = new Cesium.CustomDataSource("drawSource")
			viewer.dataSources.add(this.drawSource)
		} else {
			this.drawSource = customSource[0]!
		}
	}

	//初始化处理器 处理器实例 保持只有一个 以便管理
	private initHandler() {
		this.removeHandler()
		this._handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas)
	}

	private removeHandler() {
		if (this._handler) {
			this._handler.destroy()
			this._handler = undefined
			this.entites = []
		}
	}

	/**
	 * @description: 绘制 多边形
	 * @param {function} callback
	 */
	drawPolygon(type: ZoneType, callback: (result: Array<Wgs84Coordinate>) => void) {
		this.stopDraw()
		this.drawing = true
		const textEntity = new Cesium.Entity({
			id: "drawingLabel",
			position: new Cesium.Cartesian3(),
			label: {
				show: false,
				text: "单击某处开始绘制画多边形",
				font: "14px",
				scale: 0.8,
				showBackground: true,
				disableDepthTestDistance: Number.POSITIVE_INFINITY,
				pixelOffset: new Cesium.Cartesian2(0.0, 30.0),
			},
		})
		this.drawSource.entities.add(textEntity)

		this.initHandler()
		let activeShapePoints: Cesium.Cartesian3[] = []
		let activeShapePointsEntities: Cesium.Entity[] = []
		let activeShape: Cesium.Entity | null
		let dynamicPositions: any
		let drawingId = "drawingPolygon"
		//鼠标点击绘制 图像
		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
			const ray = this.viewer.camera.getPickRay(event.position)!
			const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene)

			if (Cesium.defined(cartesian)) {
				if (activeShapePoints.length === 0) {
					activeShapePoints.push(cartesian)
					dynamicPositions = new Cesium.CallbackProperty(
						() => new Cesium.PolygonHierarchy(activeShapePoints),
						false
					)

					activeShape = this.drawShape(dynamicPositions, type, drawingId)
				}

				if (activeShapePoints.length === 1) {
					//@ts-ignore
					textEntity.label.text = "左键点击开始，右键结束"
				}
				const drawingPointId = getRandomId("drawing-vertex-")
				const drawPoint = this.drawPoint(cartesian, drawingPointId)
				activeShapePointsEntities.push(drawPoint)
				activeShapePoints.push(cartesian)
			}
		}, Cesium.ScreenSpaceEventType.LEFT_CLICK)

		//鼠标移动更新位置
		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
			const ray = this.viewer.camera.getPickRay(event.endPosition)!
			const earthPosition = this.viewer.scene.globe.pick(ray, this.viewer.scene)!

			//@ts-ignore
			if (!textEntity.label?.show._value) {
				//@ts-ignore
				textEntity.label.show = true
			}

			textEntity.position = new Cesium.CallbackPositionProperty(() => earthPosition, false)

			if (activeShapePoints.length > 0) {
				if (Cesium.defined(activeShape)) {
					activeShapePoints.pop()
					activeShapePoints.push(earthPosition)
				}
			}
		}, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

		//鼠标右击结束
		this._handler?.setInputAction(() => {
			activeShapePoints.pop()
			if (activeShape) {
				//移除临时图形 并重新闭合图形
				this.drawSource.entities.removeById(drawingId)

				//移除临时图形的顶点
				activeShapePointsEntities.forEach((item) => {
					this.drawSource.entities.remove(item)
				})

				//重新闭合图形
				this.drawShape(activeShapePoints, type)

				//回调结果 给业务层
				const result = activeShapePoints.map((item) => {
					return Cartesian3ToWgs84(item)
				})
				callback(result)
			}

			//清空
			activeShape = null
			activeShapePointsEntities = []
			activeShapePoints = []
			dynamicPositions = null
			//@ts-ignore
			textEntity.label.text = "单击某处开始绘制画多边形"
			this.drawing = false
		}, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
	}

	editPolygon(type: ZoneType, callback: (result: Array<Wgs84Coordinate>) => void) {
		if (this.drawing) {
			ElMessage.warning("请先停止绘制")
			return
		}

		//添加鼠标悬浮标签
		const textEntity = new Cesium.Entity({
			id: "drawingLabel",
			position: new Cesium.Cartesian3(),
			label: {
				show: false,
				text: "双击图形开始编辑",
				font: "14px",
				scale: 0.8,
				showBackground: true,
				disableDepthTestDistance: Number.POSITIVE_INFINITY,
				pixelOffset: new Cesium.Cartesian2(0.0, 30.0),
			},
		})
		this.drawSource.entities.add(textEntity)
		console.log("", this.drawSource.entities.values)

		let editPoints: Cesium.Entity[] = []
		let draggedPoint: Cesium.Entity | null = null
		let editPolygon: Cesium.Entity | null = null

		this.initHandler()

		//鼠标双击实体时 生成编辑点
		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
			const pickedObject = this.viewer.scene.pick(event.position)

			//确认点击的内容是多边形
			if (
				Cesium.defined(pickedObject) &&
				Cesium.defined(pickedObject.id) &&
				pickedObject.id instanceof Cesium.Entity
			) {
				const pickedEntity = pickedObject.id as Cesium.Entity

				if (Cesium.defined(pickedEntity.polygon)) {
					//防止重复生成
					if (editPolygon?.id === pickedEntity.id) {
						ElMessage.warning("当前图形已处于编辑模式！")
						return
					}

					if (editPolygon) {
						ElMessage.warning("请先停止编辑")
						return
					}


					editPolygon = pickedEntity

					//删除当前点击的实体 并创建一个临时的实体
					this.drawSource.entities.remove(pickedEntity)

					const dynamicHierarchy = new Cesium.CallbackProperty(() => {
						const newPositions = editPoints.map((pointEntity) => {
							return pointEntity.position!.getValue()
						})

						//@ts-ignore
						return new Cesium.PolygonHierarchy(newPositions)
					}, false)

					const zoneStyle = getZoneStyle(type)
					editPolygon = this.drawSource.entities.add({
						id: pickedEntity.id, // 复用 ID
						polygon: {
							// 替换为 CallbackProperty
							hierarchy: dynamicHierarchy,
							material: zoneStyle.backgroundColor,
						},
					})


					// 初始化并生成编辑点 要用拾取的那个实体 不要使用新创建的实体
					//@ts-ignore
					const vertexPoints = pickedEntity.polygon.hierarchy?.getValue()
						.positions as Cesium.Cartesian3[]
					vertexPoints.forEach((item) => {
						let dot = this.drawPoint(item, getRandomId("edit-vertex-"), true)
						editPoints.push(dot)
					})

				}
				//更新文字标签位置
				if (textEntity.label) {
					textEntity.label.text = new Cesium.ConstantProperty('左键点击拖动顶点编辑 右键结束编辑')
				}
			}
		}, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
			const pickedObject = this.viewer.scene.pick(event.position)

			if (
				Cesium.defined(pickedObject) &&
				Cesium.defined(pickedObject.id) &&
				pickedObject.id instanceof Cesium.Entity &&
				editPoints.includes(pickedObject.id)
			) {
				this.viewer.scene.screenSpaceCameraController.enableInputs = false
				draggedPoint = pickedObject.id
			}
		}, Cesium.ScreenSpaceEventType.LEFT_DOWN)

		//鼠标移动更新位置
		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
			const ray = this.viewer.camera.getPickRay(event.endPosition)!
			const earthPosition = this.viewer.scene.globe.pick(ray, this.viewer.scene)!

			//不要使用callback属性 移动事件会创建非常多callback属性 会影响性能
			if (draggedPoint && editPolygon) {
				draggedPoint.position = new Cesium.ConstantPositionProperty(earthPosition)
			}

			//更新文字标签位置
			//@ts-ignore
			if (!textEntity.label?.show._value) {
				textEntity.label!.show = new Cesium.ConstantProperty(true)
			}
			textEntity.position = new Cesium.CallbackPositionProperty(() => earthPosition, false)
		}, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

		//鼠标抬起视为停止拖动
		this._handler?.setInputAction(() => {
			this.viewer.scene.screenSpaceCameraController.enableInputs = true
			draggedPoint = null
		}, Cesium.ScreenSpaceEventType.LEFT_UP)

		//鼠标右键完成编辑
		this._handler?.setInputAction(() => {
			if (editPolygon) {
				const finnalPosition = editPolygon?.polygon?.hierarchy?.getValue()
					.positions as Cesium.Cartesian3[]

				editPoints.forEach((item) => this.drawSource.entities.remove(item))

				const finnalId = editPolygon?.id

				this.drawSource.entities.removeById(finnalId)

				//最终的图形
				const finalShape = this.drawShape(finnalPosition, type, finnalId)

				//TODO 添加标签

				//最终的结果
				const result = finnalPosition.map((item) => {
					return Cartesian3ToWgs84(item)
				})

				editPoints = []
				editPolygon = null

				//更新文字标签位置
				if (textEntity.label) {
					textEntity.label.text = new Cesium.ConstantProperty('双击图形开始编辑')
				}
				//回调
				callback(result)

			}

			//TODO添加标签
		}, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
	}

	//绘制 图形
	drawShape(positionData: Cesium.Cartesian3[], type: ZoneType, id?: string) {
		const zoneStyle = getZoneStyle(type)
		const labelStyle = getZoneLabelStyle(type)
		const shape = this.drawSource.entities.add({
			id: id || getRandomId("polygon-"),
			properties: {
				zoneType: type,
				status: true,
				createor: "",
				name: "",
			},
			polygon: {
				hierarchy: positionData,
				material: zoneStyle.backgroundColor,
			},
		})
		return shape
	}

	stopDraw() {
		//移除控制器
		this.removeHandler()
		this.drawing = false
		//移除鼠标悬浮标签
		this.drawSource.entities.removeById("drawingLabel")
	}

	//绘制一个标准点
	drawPoint(position: Cesium.Cartesian3, id?: string, editable: boolean = false) {
		const dotStyle = getDotStyle(editable)
		const point = this.drawSource.entities.add({
			id: id || getRandomId("vertex-"),
			position: position,
			point: {
				heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
				color: dotStyle.color,
				pixelSize: 10,
				outlineColor: dotStyle.outlineColor,
				outlineWidth: 2,
			},
		})
		return point
	}

	/**
	 * @description: 绘制 点
	 * @param {function} callback 返回 一组的点位信息 [ [经度, 纬度, 高度?], ...]
	 */
	pickPoint(callback: (result: Array<Wgs84Coordinate>) => void) {
		this.initHandler()
		const pickedPoint: Cesium.Cartesian3[] = []

		//左键点击创建点
		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
			const ray = this.viewer.camera.getPickRay(event.position)
			if (ray) {
				const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene)
				if (cartesian) {
					this.drawPoint(cartesian)
					pickedPoint.push(cartesian)
				}
			}
		}, Cesium.ScreenSpaceEventType.LEFT_CLICK)

		//右键结束
		this._handler?.setInputAction(() => {
			this.removeHandler()
			const result = pickedPoint.map((item) => {
				return Cartesian3ToWgs84(item)
			})
			callback(result)
		}, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
	}
}
