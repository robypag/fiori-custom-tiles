// Copyright (c) 2009-2014 SAP SE, All Rights Reserved
(function() {
	"use strict";
	/*global jQuery, sap */

	jQuery.sap.require("sap.ushell.components.tiles.utils");
	sap.ui.controller("customtilechips.Configuration", {

		// checks given inputs
		onConfigurationInputChange: function(oControlEvent) {
			sap.ushell.components.tiles.utils.checkInput(this.getView(), oControlEvent);
		},
		// default semantic objects for dynamic applauncher: blank
		aDefaultObjects: [{
			obj: "",
			name: ""
		}],
		onInit: function() {
			var oView = this.getView(),
				oSemanticObjectSelector = oView.byId("navigation_semantic_objectInput"),
				oActionSelector = oView.byId("navigation_semantic_actionInput"),
				oResourceModel = sap.ushell.components.tiles.utils.getResourceBundleModel();

			oView.setModel(oResourceModel, "i18n");
			var oBundle = oResourceModel.getResourceBundle();
			// set view name for identification in utils
			oView.setViewName("customtilechips.Configuration");
			sap.ushell.components.tiles.utils.createSemanticObjectModel(this, oSemanticObjectSelector, this.aDefaultObjects);
			sap.ushell.components.tiles.utils.createActionModel(this, oActionSelector, this.aDefaultObjects);

			// make sure that the chose object is written back to the configuration
			oSemanticObjectSelector.attachChange(function(oControlEvent) {
				var sValue = oControlEvent.getSource().getValue();
				oView.getModel().setProperty("/config/navigation_semantic_object", sValue);
			});
			oActionSelector.attachChange(function(oControlEvent) {
				var sValue = oControlEvent.getSource().getValue();
				oView.getModel().setProperty("/config/navigation_semantic_action", sValue);
			});
			// toggle editable property of targetURL input field depending on navigation_use_semantic_object
			oView.byId("targetUrl").bindProperty("enabled", {
				formatter: function(bUseLaunchpad) {
					return !bUseLaunchpad;
				},
				path: "/config/navigation_use_semantic_object"
			});
			//Adding list items URL and Intent to the Target Type in Tile Actions section
			var oItem = new sap.ui.core.ListItem({
				key: "URL",
				text: oBundle.getText("configuration.tile_actions.table.target_type.url")
			});
			oView.byId("targetTypeCB").addItem(oItem);
			oItem = new sap.ui.core.ListItem({
				key: "INT",
				text: oBundle.getText("configuration.tile_actions.table.target_type.intent")
			});
			oView.byId("targetTypeCB").addItem(oItem);

		},

		onAfterRendering: function() {
			//            sap.ushell.components.tiles.utils.updateTooltipForDisabledProperties(this.getView());
			sap.ushell.components.tiles.utils.updateMessageStripForOriginalLanguage(this.getView());
		},

		// forward semantic object value helper request to utils
		onValueHelpRequest: function(oEvent) {
			//Third parameter is to differentiate whether it's Tile Actions icon field or general icon field. If it's true, then it's tile actions icon field, else general icon field.
			sap.ushell.components.tiles.utils.objectSelectOnValueHelpRequest(this, oEvent, false);
		},
		// forward semantic action value helper request to utils
		onActionValueHelpRequest: function(oEvent) {
			//Third parameter is to differentiate whether it's Tile Actions icon field or general icon field. If it's true, then it's tile actions icon field, else general icon field.
			sap.ushell.components.tiles.utils.actionSelectOnValueHelpRequest(this, oEvent, false);
		},
		// change handler for check box
		onCheckBoxChange: function(oEvent) {
			var oView = this.getView(),
				oSemanticObjectSelector = oView.byId("navigation_semantic_objectInput"),
				oModel = oSemanticObjectSelector.getModel(),
				value = oEvent.getSource().getSelected();
			oModel.setProperty("/enabled", value);
			sap.ushell.components.tiles.utils.checkInput(this.getView(), oEvent);
		},
		// forward icon value help request to utils
		onIconValueHelpRequest: function(oEvent) {
			//Third parameter is to differentiate whether it's Tile Actions icon field or general icon field. If it's true, then it's tile actions icon field, else general icon field.
			sap.ushell.components.tiles.utils.iconSelectOnValueHelpRequest(this, oEvent, false);
		},
		// forward icon close request to utils
		onSelectIconClose: function() {
			sap.ushell.components.tiles.utils.onSelectIconClose(this.getView());
		},
		// forward icon ok to utils
		onSelectIconOk: function() {
			sap.ushell.components.tiles.utils.onSelectIconOk(this.getView());
		},
		//This function applies table logic for the Action according to the Target Type:
		//if Taregt Type is URL, then Action field should be disabled else if it's Intent, then the Action field should be enabled.
		handleTargetTypeChange: function(oTargetTypeComboBox) {
			sap.ushell.components.tiles.utils.onTargetTypeChange(oTargetTypeComboBox);
		},
		//forward tile actions semantic object value helper request to utils
		onTileActionValueHelp: function(oEvent) {
			//Third parameter is to differentiate whether it's Tile Actions icon field or general icon field. If it's true, then it's tile actions icon field, else general icon field.
			sap.ushell.components.tiles.utils.objectSelectOnValueHelpRequest(this, oEvent, true);
		},
		//forward icon value help request to utils
		onTileActionIconValueHelp: function(oEvent) {
			//Third parameter is to differentiate whether it's Tile Actions icon field or general icon field. If it's true, then it's tile actions icon field, else general icon field.
			sap.ushell.components.tiles.utils.iconSelectOnValueHelpRequest(this, oEvent, true);
		},
		//adds new row in the tile actions table
		addRow: function() {
			sap.ushell.components.tiles.utils.addTileActionsRow(this.getView());
		},
		//delets row in the tile actions table
		deleteRow: function() {
			sap.ushell.components.tiles.utils.deleteTileActionsRow(this.getView());
		}
	});
}());