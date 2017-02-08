/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
"use strict";

import { TeamServerContext} from "../../contexts/servercontext";
import { IArgumentProvider, IExecutionResult, ITfvcCommand, IPendingChange } from "../interfaces";
import { ArgumentBuilder } from "./argumentbuilder";
import { CommandHelper } from "./commandhelper";

var fs = require("fs");

/**
 * This command returns the status of the workspace as a list of pending changes.
 * NOTE: Currently this command does not support all of the options of the command line
 * <p/>
 * status [/workspace:<value>] [/shelveset:<value>] [/format:brief|detailed|xml] [/recursive] [/user:<value>] [/nodetect] [<itemSpec>...]
 */
export class Status implements ITfvcCommand<IPendingChange[]> {
    private _serverContext: TeamServerContext;
    private _localPaths: string[];
    private _ignoreFolers: boolean;

    public constructor(serverContext: TeamServerContext, ignoreFolders: boolean, localPaths?: string[]) {
        this._serverContext = serverContext;
        this._ignoreFolers = ignoreFolders;
        this._localPaths = localPaths;
    }

    //TODO need to pass in context here as an optional parameter
    public GetArguments(): IArgumentProvider {
        const builder: ArgumentBuilder = new ArgumentBuilder("status", this._serverContext)
            .AddSwitchWithValue("format", "xml", false)
            .AddSwitch("recursive");

        if (this._localPaths && this._localPaths.length > 0) {
            for (let i = 0; i < this._localPaths.length; i++) {
                builder.Add(this._localPaths[i]);
            }
        }

        return builder;
    }

    public GetOptions(): any {
        return {};
    }

    /**
     * Parses the output of the status command when formatted as xml.
     * SAMPLE
     * <?xml version="1.0" encoding="utf-8"?>
     * <status>
     * <pending-changes>
     * <pending-change server-item="$/tfsTest_03/Folder333/DemandEquals_renamed.java" version="217" owner="NORTHAMERICA\jpricket" date="2017-02-08T11:12:06.766-0500" lock="none" change-type="rename" workspace="Folder1_00" source-item="$/tfsTest_03/Folder333/DemandEquals.java" computer="JPRICKET-DEV2" local-item="D:\tmp\tfsTest03_44\Folder333\DemandEquals_renamed.java" file-type="windows-1252"/>
     * </pending-changes>
     * <candidate-pending-changes>
     * <pending-change server-item="$/tfsTest_01/test.txt" version="0" owner="jason" date="2016-07-13T12:36:51.060-0400" lock="none" change-type="add" workspace="MyNewWorkspace2" computer="JPRICKET-DEV2" local-item="D:\tmp\test\test.txt"/>
     * </candidate-pending-changes>
     * </status>
     */
    public async ParseOutput(executionResult: IExecutionResult): Promise<IPendingChange[]> {
        // Throw if any errors are found in stderr or if exitcode is not 0
        CommandHelper.ProcessErrors(this.GetArguments().GetCommand(), executionResult);

        let changes: IPendingChange[] = [];
        const xml: string = CommandHelper.TrimToXml(executionResult.stdout);
        // Parse the xml using xml2js
        const json: any = await CommandHelper.ParseXml(xml);
        if (json && json.status) {
            // get all the pending changes first
            const pending: any = json.status.pendingchanges[0].pendingchange;
            for (let i = 0; i < pending.length; i++) {
                this.add(changes, this.convert(pending[i].$, false), this._ignoreFolers);
            }
            // next, get all the candidate pending changes
            const candidate: any = json.status.candidatependingchanges[0].pendingchange;
            for (let i = 0; i < candidate.length; i++) {
                this.add(changes, this.convert(candidate[i].$, false), this._ignoreFolers);
            }
        }
        return changes;
    }

    private add(changes: IPendingChange[], newChange: IPendingChange, ignoreFolders: boolean) {
        // Deleted files won't exist, but we still include them in the results
        if (ignoreFolders && fs.existsSync(newChange.localItem)) {
            // check to see if the local item is a file or folder
            const f: string = newChange.localItem;
            const stats: any = fs.lstatSync(f);
            if (stats.isDirectory()) {
                // It's a directory/folder and we don't want those
                return;
            }
        }
        changes.push(newChange);
    }

    private convert(jsonChange: any, isCandidate: boolean): IPendingChange {
        // TODO check to make sure jsonChange is valid
        return {
            changeType: jsonChange.changetype,
            computer: jsonChange.computer,
            date: jsonChange.date,
            localItem: jsonChange.localitem,
            sourceItem: jsonChange.sourceitem,
            lock: jsonChange.lock,
            owner: jsonChange.owner,
            serverItem: jsonChange.serveritem,
            version: jsonChange.version,
            workspace: jsonChange.workspace,
            isCandidate: isCandidate
        };
    }
}