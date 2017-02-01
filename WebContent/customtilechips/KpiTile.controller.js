// Copyright (c) 2009-2014 SAP SE, All Rights Reserved
(function() {
	"use strict";
	/*global jQuery, OData, sap, setTimeout, hasher */
	sap.ui.getCore().loadLibrary("sap.m");
	jQuery.sap.require("sap.ui.core.IconPool");
	jQuery.sap.require("sap.ui.thirdparty.datajs");
	jQuery.sap.require("sap.ushell.components.tiles.utils");

	sap.ui.controller("customtilechips.KpiTile", {
		// handle to control/cancel browser's setTimeout()
		timer: null,
		// handle to control/cancel data.js OData.read()
		oDataRequest: null,
		onInit: function() {
			var oView = this.getView(),
				oViewData = oView.getViewData(),
				oTileApi = oViewData.chip,
				oConfig = sap.ushell.components.tiles.utils.getConfiguration(oTileApi, oTileApi.configurationUi.isEnabled(), false),
				oModel,
				sKeywords,
				aKeywords,
				that = this,
				sNavigationTargetUrl = oConfig.navigation_target_url,
				sSystem;
			this.bIsDataRequested = false;
			sSystem = oTileApi.url.getApplicationSystem();
			if (sSystem) { // propagate system to target application
				sNavigationTargetUrl += ((sNavigationTargetUrl.indexOf("?") < 0) ? "?" : "&") + "sap-system=" + sSystem;
			}
			this.navigationTargetUrl = sNavigationTargetUrl;
			/*
			 * Model of the applauncher tile consisting of
			 *          config (tile configuration),
			 *          data (dyanmic data read from a data source)
			 *          nav (target URL set to '' in case of Admin UI), and
			 *          search (highlight terms)
			 */
			var data = sap.ushell.components.tiles.utils.getDataToDisplay(oConfig, {
				number: (oTileApi.configurationUi.isEnabled() ? 1234 : "...")
			});
			oModel = new sap.ui.model.json.JSONModel({
				config: oConfig,
				data: data,
				nav: {
					navigation_target_url: (oTileApi.configurationUi && oTileApi.configurationUi.isEnabled() ? "" : sNavigationTargetUrl)
				},
				search: {
					display_highlight_terms: []
				}
			});
			oView.setModel(oModel);

			// implement search contract
			if (oTileApi.search) {
				// split and clean keyword string (may be comma + space delimited)
				sKeywords = oView.getModel().getProperty("/config/display_search_keywords");
				aKeywords = jQuery.grep(sKeywords.split(/[, ]+/), function(n, i) {
					return n && n !== "";
				});

				// add title and subtitle (if present) to keywords for better FLP searching
				if (oConfig.display_title_text && oConfig.display_title_text !== "" &&
					aKeywords.indexOf(oConfig.display_title_text) === -1) {
					aKeywords.push(oConfig.display_title_text);
				}
				if (oConfig.display_subtitle_text && oConfig.display_subtitle_text !== "" &&
					aKeywords.indexOf(oConfig.display_subtitle_text) === -1) {
					aKeywords.push(oConfig.display_subtitle_text);
				}
				if (oConfig.display_info_text && oConfig.display_info_text !== "" &&
					aKeywords.indexOf(oConfig.display_info_text) === -1) {
					aKeywords.push(oConfig.display_info_text);
				}

				// defined in search contract:
				oTileApi.search.setKeywords(aKeywords);
				oTileApi.search.attachHighlight(
					function(aHighlightWords) {
						// update model for highlighted search term
						oView.getModel().setProperty("/search/display_highlight_terms", aHighlightWords);
					}
				);
			}

			// implement bag update handler
			if (oTileApi.bag && oTileApi.bag.attachBagsUpdated) {
				// is only called by the FLP for bookmark tiles which have been updated via bookmark service
				oTileApi.bag.attachBagsUpdated(function(aUpdatedBagIds) {
					if (aUpdatedBagIds.indexOf("tileProperties") > -1) {
						sap.ushell.components.tiles.utils._updateTilePropertiesTexts(oView, oTileApi.bag.getBag('tileProperties'));
					}
				});
			}

			// implement preview contract
			if (oTileApi.preview) {
				oTileApi.preview.setTargetUrl(sNavigationTargetUrl);
				oTileApi.preview.setPreviewIcon(oConfig.display_icon_url);
				oTileApi.preview.setPreviewTitle(oConfig.display_title_text);
			}

			// implement refresh contract
			if (oTileApi.refresh) {
				oTileApi.refresh.attachRefresh(this.refreshHandler.bind(null, this));
			}

			// attach the refresh handler also for the visible contract, as we would like
			// on setting visible to true, to directly go and call the oData call
			if (oTileApi.visible) {
				oTileApi.visible.attachVisible(this.visibleHandler.bind(this));
			}

			// implement configurationUi contract: setup configuration UI
			if (oTileApi.configurationUi.isEnabled()) {
				oTileApi.configurationUi.setUiProvider(function() {
					// attach configuration UI provider, which is essentially a components.tiles.dynamicapplauncher.Configuration
					var oConfigurationUi = sap.ushell.components.tiles.utils.getConfigurationUi(oView, "customtilechips.Configuration");
					oTileApi.configurationUi.attachCancel(that.onCancelConfiguration.bind(null, oConfigurationUi));
					oTileApi.configurationUi.attachSave(that.onSaveConfiguration.bind(null, oConfigurationUi));
					return oConfigurationUi;
				});

				this.getView().getContent()[0].setTooltip(
					sap.ushell.components.tiles.utils.getResourceBundleModel().getResourceBundle()
					.getText("edit_configuration.tooltip")
				);
			} else {
				if (!oTileApi.preview || !oTileApi.preview.isEnabled()) {
					if (!sSystem) {
						sap.ushell.Container.addRemoteSystemForServiceUrl(oConfig.service_url);
					} // else registration is skipped because registration has been done already
					// outside this controller (e.g. remote catalog registration)

					// start fetching data from backend service if not in preview or admin mode
					this.onUpdateDynamicData();
				}
			}

			// attach the tile actions provider for the actions contract
			if (oTileApi.actions) {
				//TODO check new property name with designer dudes
				var aActions = oConfig.actions,
					aExtendedActions;
				if (aActions) {
					aExtendedActions = aActions.slice();
				} else {
					aExtendedActions = [];
				}

				var tileSettingsAction = sap.ushell.components.tiles.utils.getTileSettingsAction(oModel, this.onSaveRuntimeSettings.bind(this));
				aExtendedActions.push(tileSettingsAction);

				oTileApi.actions.setActionsProvider(function() {
					return aExtendedActions;
				});
			}

		},
		// convenience function to stop browser's timeout and OData calls
		stopRequests: function() {
			if (this.timer) {
				clearTimeout(this.timer);
			}
			if (this.oDataRequest) {
				try {
					this.oDataRequest.abort();
				} catch (e) {
					jQuery.sap.log.warning(e.name, e.message);
				}
			}
		},
		// destroy handler stops requests
		onExit: function() {
			this.stopRequests();
		},
		// trigger to show the configuration UI if the tile is pressed in Admin mode
		onPress: function() {
			var oView = this.getView(),
				oViewData = oView.getViewData(),
				oModel = oView.getModel(),
				sTargetUrl = oModel.getProperty("/nav/navigation_target_url"),
				oTileApi = oViewData.chip;
			if (oTileApi.configurationUi.isEnabled()) {
				oTileApi.configurationUi.display();
			} else if (sTargetUrl) {
				if (sTargetUrl[0] === '#') {
					hasher.setHash(sTargetUrl);
				} else {
					window.open(sTargetUrl, '_blank');
				}
			}
		},
		// dynamic data updater
		onUpdateDynamicData: function() {
			var oView = this.getView(),
				oConfig = oView.getModel().getProperty("/config"),
				nservice_refresh_interval = oConfig.service_refresh_interval;
			if (!nservice_refresh_interval) {
				nservice_refresh_interval = 0;
			} else if (nservice_refresh_interval < 10) {
				// log in English only
				jQuery.sap.log.warning(
					"Refresh Interval " + nservice_refresh_interval + " seconds for service URL " + oConfig.service_url +
					" is less than 10 seconds, which is not supported. " + "Increased to 10 seconds automatically.",
					null,
					"sap.ushell.components.tiles.applauncherdynamic.DynamicTile.controller"
				);
				nservice_refresh_interval = 10;
			}
			if (oConfig.service_url) {
				this.loadData(nservice_refresh_interval);
			}
		},
		extractData: function(oData) {
			var name,
				aKeys = ["results", "icon", "title", "number",
					"numberUnit", "info", "infoState", "infoStatus",
					"targetParams", "subtitle", "stateArrow", "numberState",
					"numberDigits", "numberFactor"
				];

			if (typeof oData === "object" && Object.keys(oData).length === 1) {
				name = Object.keys(oData)[0];
				if (jQuery.inArray(name, aKeys) === -1) {
					return oData[name];
				}
			}
			return oData;
		},
		// tile settings action UI save handler
		onSaveRuntimeSettings: function(oSettingsView) {
			var
				oViewModel = oSettingsView.getModel(),
				oTileApi = this.getView().getViewData().chip,
				oConfigToSave = this.getView().getModel().getProperty("/config");

			oConfigToSave.display_title_text = oViewModel.getProperty('/title');
			oConfigToSave.display_subtitle_text = oViewModel.getProperty('/subtitle');
			oConfigToSave.display_info_text = oViewModel.getProperty('/info');
			oConfigToSave.display_search_keywords = oViewModel.getProperty('/keywords');

			// use bag contract in order to store translatable properties
			var tilePropertiesBag = oTileApi.bag.getBag('tileProperties');
			tilePropertiesBag.setText('display_title_text', oConfigToSave.display_title_text);
			tilePropertiesBag.setText('display_subtitle_text', oConfigToSave.display_subtitle_text);
			tilePropertiesBag.setText('display_info_text', oConfigToSave.display_info_text);
			tilePropertiesBag.setText('display_search_keywords', oConfigToSave.display_search_keywords);

			function logErrorAndReject(oError) {
				jQuery.sap.log.error(oError, null, "sap.ushell.components.tiles.applauncherdynamic.DynamicTile.controller");
			}

			// saving the relevant properteis
			tilePropertiesBag.save(
				// success handler
				function() {
					jQuery.sap.log.debug("property bag 'tileProperties' saved successfully");

					// update the local tile's config - saving changes on the Model
					this.getView().getModel().setProperty("/config", oConfigToSave);

					// update tile's model for changes to appear immediately
					// (and not wait for the refresh handler which happens every 10 seconds)
					this.getView().getModel().setProperty('/data/display_title_text', oConfigToSave.display_title_text);
					this.getView().getModel().setProperty('/data/display_subtitle_text', oConfigToSave.display_subtitle_text);
					this.getView().getModel().setProperty('/data/display_info_text', oConfigToSave.display_info_text);

					// call to refresh model which (due to the binding) will refresh the tile
					this.getView().getModel().refresh();
				}.bind(this),
				logErrorAndReject // error handler
			);
		},
		// configuration save handler
		onSaveConfiguration: function(oConfigurationView) {
			var
			// the deferred object required from the configurationUi contract
				oDeferred = jQuery.Deferred(),
				oModel = oConfigurationView.getModel(),
				// tile model placed into configuration model by getConfigurationUi
				oTileModel = oModel.getProperty("/tileModel"),
				oTileApi = oConfigurationView.getViewData().chip,
				aTileNavigationActions = sap.ushell.components.tiles.utils.tileActionsRows2TileActionsArray(oModel.getProperty(
					"/config/tile_actions_rows")),
				// get the configuration to save from the model
				configToSave = {
					display_icon_url: oModel.getProperty("/config/display_icon_url"),
					display_number_unit: oModel.getProperty("/config/display_number_unit"),
					service_url: oModel.getProperty("/config/service_url"),
					service_refresh_interval: oModel.getProperty("/config/service_refresh_interval"),
					navigation_use_semantic_object: oModel.getProperty("/config/navigation_use_semantic_object"),
					navigation_target_url: oModel.getProperty("/config/navigation_target_url"),
					navigation_semantic_object: jQuery.trim(oModel.getProperty("/config/navigation_semantic_object")) || "",
					navigation_semantic_action: jQuery.trim(oModel.getProperty("/config/navigation_semantic_action")) || "",
					navigation_semantic_parameters: jQuery.trim(oModel.getProperty("/config/navigation_semantic_parameters")),
					display_search_keywords: oModel.getProperty("/config/display_search_keywords")
				};
			//If the input fields icon, semantic object and action are failing the input validations, then through an error message requesting the user to enter/correct those fields
			var bReject = sap.ushell.components.tiles.utils.checkInputOnSaveConfig(oConfigurationView);
			if (!bReject) {
				bReject = sap.ushell.components.tiles.utils.checkTileActions(oConfigurationView);
			}
			if (bReject) {
				oDeferred.reject("mandatory_fields_missing");
				return oDeferred.promise();
			}
			// overwrite target URL in case of semantic object navigation
			if (configToSave.navigation_use_semantic_object) {
				configToSave.navigation_target_url = sap.ushell.components.tiles.utils.getSemanticNavigationUrl(configToSave);
				oModel.setProperty("/config/navigation_target_url", configToSave.navigation_target_url);
			}

			// use bag contract in order to store translatable properties
			var tilePropertiesBag = oTileApi.bag.getBag('tileProperties');
			tilePropertiesBag.setText('display_title_text', oModel.getProperty("/config/display_title_text"));
			tilePropertiesBag.setText('display_subtitle_text', oModel.getProperty("/config/display_subtitle_text"));
			tilePropertiesBag.setText('display_info_text', oModel.getProperty("/config/display_info_text"));
			tilePropertiesBag.setText('display_search_keywords', configToSave.display_search_keywords);

			var tileNavigationActionsBag = oTileApi.bag.getBag('tileNavigationActions');
			//forward populating of tile navigation actions array into the bag, to Utils
			sap.ushell.components.tiles.utils.populateTileNavigationActionsBag(tileNavigationActionsBag, aTileNavigationActions);

			function logErrorAndReject(oError, oErrorInfo) {
				jQuery.sap.log.error(oError, null, "sap.ushell.components.tiles.applauncherdynamic.DynamicTile.controller");
				oDeferred.reject(oError, oErrorInfo);
			}

			// use configuration contract to write parameter values
			oTileApi.writeConfiguration.setParameterValues({
					tileConfiguration: JSON.stringify(configToSave)
				},
				// success handler
				function() {
					var oConfigurationConfig = sap.ushell.components.tiles.utils.getConfiguration(oTileApi, false, false),
						// get tile config data in admin mode
						oTileConfig = sap.ushell.components.tiles.utils.getConfiguration(oTileApi, true, false),
						// switching the model under the tile -> keep the tile model
						oModel = new sap.ui.model.json.JSONModel({
							config: oConfigurationConfig,
							// keep tile model
							tileModel: oTileModel
						});
					oConfigurationView.setModel(oModel);

					// update tile model
					oTileModel.setData({
						data: oTileConfig,
						nav: {
							navigation_target_url: ""
						}
					}, false);
					if (oTileApi.preview) {
						oTileApi.preview.setTargetUrl(oConfigurationConfig.navigation_target_url);
						oTileApi.preview.setPreviewIcon(oConfigurationConfig.display_icon_url);
						oTileApi.preview.setPreviewTitle(oConfigurationConfig.display_title_text);
					}

					tilePropertiesBag.save(
						// success handler
						function() {
							jQuery.sap.log.debug("property bag 'tileProperties' saved successfully");
							// update possibly changed values via contracts
							if (oTileApi.title) {
								oTileApi.title.setTitle(
									configToSave.display_title_text,
									// success handler
									function() {
										oDeferred.resolve();
									},
									logErrorAndReject // error handler
								);
							} else {
								oDeferred.resolve();
							}
						},
						logErrorAndReject // error handler
					);

					tileNavigationActionsBag.save(
						// success handler
						function() {
							jQuery.sap.log.debug("property bag 'navigationProperties' saved successfully");
						},
						logErrorAndReject // error handler
					);
				},
				logErrorAndReject // error handler
			);

			return oDeferred.promise();
		},

		successHandleFn: function(oResult) {
			var oConfig = this.getView().getModel().getProperty("/config");
			this.oDataRequest = undefined;
			var oData = oResult,
				oDataToDisplay;
			if (typeof oResult === "object") {
				var uriParamInlinecount = jQuery.sap.getUriParameters(oConfig.service_url).get("$inlinecount");
				if (uriParamInlinecount && uriParamInlinecount === "allpages") {
					oData = {
						number: oResult.__count
					};
				} else {
					oData = this.extractData(oData);
				}
			} else if (typeof oResult === "string") {
				oData = {
					number: oResult
				};
			}
			oDataToDisplay = sap.ushell.components.tiles.utils.getDataToDisplay(oConfig, oData);
			
			// Begin Change --------------------------->
			// Use "emp" property to store original data
			var aKeys = [
				// Additional data for our KPI Tile //
				"month1", "month2", "month3", "value1", "value2",
				"value3", "color1", "color2", "color3"
				// End additional data //
			];
			// Prepare emp object:
			oResult.results = {};
			for (var i = 0; i < aKeys.length; i++) {
				//sName = aKeys[i];
				oResult.results[aKeys[i]] = oResult[aKeys[i]];
			}
			// Store the additional results back to emp
			oDataToDisplay.emp = oResult.results;
			// End Change <---------------------------

			// set data to display
			this.getView().getModel().setProperty("/data", oDataToDisplay);

			// rewrite target URL
			this.getView().getModel().setProperty("/nav/navigation_target_url",
				sap.ushell.components.tiles.utils.addParamsToUrl(
					this.navigationTargetUrl,
					oDataToDisplay
				));
		},

		// error handler
		errorHandlerFn: function(oMessage) {
			var oConfig = this.getView().getModel().getProperty("/config");
			this.oDataRequest = undefined;
			var sMessage = oMessage && oMessage.message ? oMessage.message : oMessage,
				oResourceBundle = sap.ushell.components.tiles.utils.getResourceBundleModel()
				.getResourceBundle();
			if (oMessage.response) {
				sMessage += " - " + oMessage.response.statusCode + " " + oMessage.response.statusText;
			}
			// log in English only
			jQuery.sap.log.error(
				"Failed to update data via service " + oConfig.service_url + ": " + sMessage,
				null,
				"sap.ushell.components.tiles.applauncherdynamic.DynamicTile"
			);
			this.getView().getModel().setProperty("/data",
				sap.ushell.components.tiles.utils.getDataToDisplay(oConfig, {
					number: "???",
					info: oResourceBundle.getText("dynamic_data.error"),
					infoState: "Critical"
				})
			);
		},

		// configuration cancel handler
		onCancelConfiguration: function(oConfigurationView, successHandler, errorHandle) {
			// re-load old configuration and display
			var oViewData = oConfigurationView.getViewData(),
				oModel = oConfigurationView.getModel(),
				// tile model placed into configuration model by getConfigurationUi
				oTileModel = oModel.getProperty("/tileModel"),
				oTileApi = oViewData.chip,
				oCurrentConfig = sap.ushell.components.tiles.utils.getConfiguration(oTileApi, false, false);
			oConfigurationView.getModel().setData({
				config: oCurrentConfig,
				tileModel: oTileModel
			}, false);
		},
		// loads data from backend service
		loadData: function(nservice_refresh_interval) {
			var oDynamicTileView = this.getView(),
				oConfig = oDynamicTileView.getModel().getProperty("/config"),
				sUrl = oConfig.service_url,
				that = this;
			var oTileApi = this.getView().getViewData().chip;
			if (!sUrl) {
				return;
			}
			if (/;o=([;\/?]|$)/.test(sUrl)) { // URL has placeholder segment parameter ;o=
				sUrl = oTileApi.url.addSystemToServiceUrl(sUrl);
			}
			//set the timer if required
			if (nservice_refresh_interval > 0) {
				// log in English only
				jQuery.sap.log.info(
					"Wait " + nservice_refresh_interval + " seconds before calling " + oConfig.service_url + " again",
					null,
					"sap.ushell.components.tiles.applauncherdynamic.DynamicTile.controller"
				);
				// call again later
				this.timer = setTimeout(that.loadData.bind(that, nservice_refresh_interval, false), (nservice_refresh_interval * 1000));
			}

			// Verify the the Tile visibility is "true" in order to issue an oData request
			if (oTileApi.visible.isVisible() && !that.oDataRequest) {
				this.bIsDataRequested = true;
				that.oDataRequest = OData.read({
						requestUri: sUrl,
						headers: {
							"Cache-Control": "no-cache, no-store, must-revalidate",
							"Pragma": "no-cache",
							"Expires": "0"
						}
					},
					// sucess handler
					this.successHandleFn.bind(this),
					this.errorHandlerFn.bind(this)
				); // End of oData.read
			}
		},
		// loads data once if not in configuration mode
		refreshHandler: function(oDynamicTileController) {
			var oTileApi = oDynamicTileController.getView().getViewData().chip;
			if (!oTileApi.configurationUi.isEnabled()) {
				oDynamicTileController.loadData(0);
			} else {
				oDynamicTileController.stopRequests();
			}
		},

		// load data in place in case setting visibility from false to true
		// with no additional timer registered
		visibleHandler: function(isVisible) {
			var oView = this.getView(),
				oConfig = oView.getModel().getProperty("/config"),
				nservice_refresh_interval = oConfig.service_refresh_interval;
			if (isVisible) {
				if (!this.bIsDataRequested) {
					//tile is visible and data wasn't requested yet
					this.refreshHandler(this);
				}
				if (nservice_refresh_interval) {
					//tile is visible and the refresh interval isn't set to 0
					this.refreshHandler(this);
				}
			} else {
				this.stopRequests();
			}
		}

	});
}());