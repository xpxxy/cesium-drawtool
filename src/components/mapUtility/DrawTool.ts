import * as Cesium from "cesium"
import {
	Cartesian3ToWgs84,
	distanceInMeters,
	getDotStyle,
	getRandomId,
	getZoneLabelStyle,
	getZoneStyle,
} from "./utils"
import type { Circle, Wgs84Coordinate, ZoneType } from "./types"
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

					activeShape = this.drawPolygonShape(dynamicPositions, type, drawingId)
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
				textEntity.label!.show = new Cesium.ConstantProperty(true)
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
				this.drawPolygonShape(activeShapePoints, type)

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

					// editPolygon = pickedEntity

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
					textEntity.label.text = new Cesium.ConstantProperty("左键点击拖动顶点编辑 右键结束编辑")
				}
			}
		}, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

		//鼠标左键按下时
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
				const finalShape = this.drawPolygonShape(finnalPosition, type, finnalId)

				//TODO 添加标签

				//最终的结果
				const result = finnalPosition.map((item) => {
					return Cartesian3ToWgs84(item)
				})

				editPoints = []
				editPolygon = null

				//更新文字标签位置
				if (textEntity.label) {
					textEntity.label.text = new Cesium.ConstantProperty("双击图形开始编辑")
				}
				//回调
				callback(result)
			}

			//TODO添加标签
		}, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
	}

	//绘制 图形
	drawPolygonShape(positionData: Cesium.Cartesian3[], type: ZoneType, id?: string) {
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

	drawCircle(type: ZoneType, callback: (result: Circle) => void) {
		this.stopDraw()

		const textEntity = new Cesium.Entity({
			id: "drawingLabel",
			position: new Cesium.Cartesian3(),
			label: {
				show: false,
				text: "单击某处开始绘制画圆形",
				font: "14px",
				scale: 0.8,
				showBackground: true,
				disableDepthTestDistance: Number.POSITIVE_INFINITY,
				pixelOffset: new Cesium.Cartesian2(0.0, 30.0),
			},
		})
		this.drawSource.entities.add(textEntity)

		this.initHandler()

		let _center: Cesium.Cartesian3 | undefined
		let _centerPoint: Cesium.Entity | undefined
		let _circle: Cesium.Entity | undefined
		let _circleRadius: number = 0
		let drawingCenterId: string = ""
		let drawingId: string = ""
		const circleStyle = getZoneStyle(type)

		//左键点击获取圆心并创建初始圆
		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
			if (this.drawing) {
				ElMessage.warning("请先结束当前的绘制！")
				return
			}

			this.drawing = true
			const ray = this.viewer.camera.getPickRay(event.position)!
			_center = this.viewer.scene.globe.pick(ray, this.viewer.scene)!

			drawingCenterId = getRandomId("vertex-center-")
			drawingId = getRandomId("circle-")

			//创建圆心
			_centerPoint = this.drawPoint(_center, drawingCenterId)

			//先绘制默认的单位圆 后根据鼠标移动更新半径
			_circle = this.drawCircleShape(type, _center, 1, drawingId)
		}, Cesium.ScreenSpaceEventType.LEFT_CLICK)

		//鼠标移动更新半径大小
		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
			const ray = this.viewer.camera.getPickRay(event.endPosition)!
			const earthPosition = this.viewer.scene.globe.pick(ray, this.viewer.scene)!

			//@ts-ignore
			if (!textEntity.label?.show._value) {
				textEntity.label!.show = new Cesium.ConstantProperty(true)
			}
			textEntity.position = new Cesium.CallbackPositionProperty(() => earthPosition, false)

			textEntity.label!.text = new Cesium.ConstantProperty("左键设置圆心，右键结束绘制")

			//没有圆心和初始圆则不执行
			if (!_center || !_circle) return

			//转换圆形的半径为米
			const newRadius = distanceInMeters(_center, earthPosition)

			//动态更新圆半径
			_circle.ellipse!.semiMajorAxis = new Cesium.CallbackProperty(() => newRadius, false)
			_circle.ellipse!.semiMinorAxis = new Cesium.CallbackProperty(() => newRadius, false)

			_circleRadius = newRadius
		}, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

		//右键结束绘制
		this._handler?.setInputAction(() => {
			if (_center && this.drawing) {
				this.drawSource.entities.removeById(drawingCenterId)
				this.drawSource.entities.removeById(drawingId)
				if (_circleRadius < 10) {
					ElMessage.warning("半径过小 不得小于10m")
					_center = undefined
					_circle = undefined
					_centerPoint = undefined
					_circleRadius = 0

					return
				}
				this.drawing = false
				this.drawCircleShape(type, _center!, _circleRadius, drawingId)
				const result: Circle = {
					id: drawingId,
					center: Cartesian3ToWgs84(_center!),
					radius: _circleRadius,
				}

				//更新文字标签位置
				if (textEntity.label) {
					textEntity.label.text = new Cesium.ConstantProperty("单击某处开始绘制圆形")
				}
				// this._handler?.removeInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE)
				callback(result)
			}
		}, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
	}

	editCircle(type: ZoneType, callback: (result: Circle) => void) {
		if (this.drawing) {
			ElMessage.warning("请先停止绘制")
			return
		}

		this.stopDraw()

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

		this.initHandler()
		let editingId = ""
		let editCircle: Cesium.Entity | undefined
		let editCenter: Cesium.Cartesian3 | undefined
		let editRadius = 0
		let editCenterPoint: Cesium.Entity | undefined
		let dragging = false
		let draggingCenter = false
		let draggedPoint: Cesium.Cartesian3 | undefined
		let draggedPointEntity: Cesium.Entity | undefined
		//鼠标双击实体时 生成编辑点
		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
			const pickedObject = this.viewer.scene.pick(event.position)

			//确认点击的内容是圆
			if (
				Cesium.defined(pickedObject) &&
				Cesium.defined(pickedObject.id) &&
				pickedObject.id instanceof Cesium.Entity
			) {
				const pickedEntity = pickedObject.id as Cesium.Entity
				console.log("获取的圆：", pickedEntity)

				if (Cesium.defined(pickedEntity.ellipse)) {
					//防止重复生成
					if (editCircle?.id === pickedEntity.id) {
						ElMessage.warning("当前图形已处于编辑模式！")
						return
					}

					//编辑结束该项会被清空 可以用于判断是否还在编辑状态
					if (editCircle) {
						ElMessage.warning("请先停止编辑")
						return
					}

					//删除当前点击的实体 并创建一个临时的实体
					this.drawSource.entities.remove(pickedEntity)

					//获取圆心
					editCenter = pickedEntity!.position!.getValue()

					//获取半径的值
					editRadius = pickedEntity.ellipse!.semiMajorAxis!.getValue()

					//获取之前的id 复用
					editingId = pickedEntity.id

					//创建新的圆
					editCircle = this.drawCircleShape(
						type,
						editCenter!,
						editRadius!,
						editingId
					)

					//创建新的圆心
					editCenterPoint = this.drawPoint(
						editCenter!,
						getRandomId("edit-vertex-"),
						true,
					)

					//创建可拖拽的点

					//在0弧度位置的圆上 创建一个可拖拽点 此处角度可以任意 弧度值 此处就用0
					const angleRadians = Cesium.Math.toRadians(0)

					const deltaX = editRadius * Math.cos(angleRadians) // East 偏移
					const deltaY = editRadius * Math.sin(angleRadians) // North 偏移

					const transform = Cesium.Transforms.eastNorthUpToFixedFrame(editCenter!)

					const localPoint = new Cesium.Cartesian3(deltaX, deltaY, 0)

					const worldPoint = Cesium.Matrix4.multiplyByPoint(
						transform,
						localPoint,
						new Cesium.Cartesian3() // 使用新的 Cartesian3 存储结果
					)

					draggedPoint = worldPoint

					//将拖拽点设置为动态
					// const dynamicPositions = new Cesium.CallbackPositionProperty(() => draggedPoint, false)

					//生成拖拽点
					draggedPointEntity = this.drawPoint(
						draggedPoint,
						getRandomId("edit-vertex-"),
						true,
					)

					//将圆半径与拖拽点关联设置为动态
					const dynamicRadius = new Cesium.CallbackProperty(() => {
						if (draggedPoint && editCenter) {
							return distanceInMeters(draggedPoint, editCenter)
						}
						return editRadius
					}, false)

					editCircle.ellipse!.semiMajorAxis = dynamicRadius
					editCircle.ellipse!.semiMinorAxis = dynamicRadius
				}
				//更新文字标签位置
				if (textEntity.label) {
					textEntity.label.text = new Cesium.ConstantProperty("左键点击拖动顶点编辑 右键结束编辑")
				}
			}
		}, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

		//鼠标左键按下时
		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
			const pickedObject = this.viewer.scene.pick(event.position)

			if (
				Cesium.defined(pickedObject) &&
				Cesium.defined(pickedObject.id) &&
				pickedObject.id instanceof Cesium.Entity &&
				draggedPointEntity === pickedObject.id
			) {
				dragging = true
				this.viewer.scene.screenSpaceCameraController.enableInputs = false
				draggedPointEntity = pickedObject.id
			} else if (editCenterPoint && pickedObject.id === editCenterPoint) {
				draggingCenter = true
				this.viewer.scene.screenSpaceCameraController.enableInputs = false
			}
		}, Cesium.ScreenSpaceEventType.LEFT_DOWN)

		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
			const ray = this.viewer.camera.getPickRay(event.endPosition)!
			const earthPosition = this.viewer.scene.globe.pick(ray, this.viewer.scene)!

			// 更新拖动点的位置
			if (draggedPointEntity && editCircle && dragging) {
				draggedPoint = earthPosition
				draggedPointEntity!.position = new Cesium.ConstantPositionProperty(earthPosition)

				//更新半径大小
				editRadius = distanceInMeters(draggedPoint, editCenter!)
			}

			if (editCenterPoint && editCircle && draggingCenter) {
				// 更新圆心位置
				editCenter = earthPosition
				editCenterPoint.position = new Cesium.ConstantPositionProperty(earthPosition)
				editCircle.position = new Cesium.ConstantPositionProperty(earthPosition)

				// 让拖拽点跟随平移：保持相对圆心位置
				if (draggedPoint && editRadius) {
					// 计算圆心的局部坐标变换（维持圆上方向）
					const transform = Cesium.Transforms.eastNorthUpToFixedFrame(editCenter)
					const localPoint = new Cesium.Cartesian3(editRadius, 0, 0)
					const worldPoint = Cesium.Matrix4.multiplyByPoint(
						transform,
						localPoint,
						new Cesium.Cartesian3()
					)
					draggedPoint = worldPoint
					draggedPointEntity!.position = new Cesium.ConstantPositionProperty(worldPoint)
				}
			}

			//更新文字标签位置
			//@ts-ignore
			if (!textEntity.label?.show._value) {
				textEntity.label!.show = new Cesium.ConstantProperty(true)
			}
			textEntity.position = new Cesium.CallbackPositionProperty(() => earthPosition, false)
		}, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

		this._handler?.setInputAction(() => {
			draggingCenter = false
			dragging = false
			this.viewer.scene.screenSpaceCameraController.enableInputs = true
		}, Cesium.ScreenSpaceEventType.LEFT_UP)

		this._handler?.setInputAction((event: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
			if (editingId && editCircle && editCenter) {
				//移除临时实体
				this.drawSource.entities.removeById(editingId)

				//移除圆心与拖拽点
				if(editCenterPoint) this.drawSource.entities.remove(editCenterPoint)
				if(draggedPointEntity) this.drawSource.entities.remove(draggedPointEntity)


				//重绘 最终的圆
				const finalRadius = distanceInMeters(draggedPoint!, editCenter!)
				const finalShape = this.drawCircleShape(type, editCenter!, finalRadius, editingId)

				const result = {
					id: editingId,
					center: Cartesian3ToWgs84(editCenter),
					radius: finalRadius,
					type: type,
				}

				//更新文字标签位置
				if (textEntity.label) {
					textEntity.label.text = new Cesium.ConstantProperty("左键点击拖动顶点编辑 右键结束编辑")
				}

				callback(result)

				draggingCenter = false
				dragging = false

				editingId = ""
				draggedPoint = undefined
				draggedPointEntity = undefined
				editCircle = undefined
				editCenter = undefined
				editCenterPoint = undefined
			}
		}, Cesium.ScreenSpaceEventType.RIGHT_CLICK)
	}
	//绘制圆形
	drawCircleShape(type: ZoneType, center: Cesium.Cartesian3, radius: number, id?: string) {
		const circleStyle = getZoneStyle(type)
		const circleShape = this.drawSource.entities.add({
			id: id || getRandomId("circle-"),
			position: center,
			properties: {
				zoneType: type,
				status: true,
				createor: "",
				name: "",
			},
			ellipse: {
				semiMajorAxis: radius,
				semiMinorAxis: radius,
				heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
				material: circleStyle.backgroundColor,
				outline: true,
				outlineColor: circleStyle.outlineColor,
				outlineWidth: 15,
				show: true,
			},
		})
		return circleShape
	}

	//绘制一个标准点
	drawPoint(
		position: Cesium.Cartesian3 | Cesium.PositionProperty,
		id?: string,
		editable: boolean = false,
	) {
		const dotStyle = getDotStyle(editable)
		const point = this.drawSource.entities.add({
			id: id || getRandomId("vertex-"),
			position: position,
			point: {
				disableDepthTestDistance: Number.POSITIVE_INFINITY,
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

	stopDraw() {
		//移除控制器
		this.removeHandler()
		this.drawing = false
		//移除鼠标悬浮标签
		this.drawSource.entities.removeById("drawingLabel")
	}
}
