import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FlatElementTypeCondition } from "../../../../model/schema.model";
import {JSONFormSchema, JSONFormSchemaOneOfItem} from "../json-form.component";
import {EntityAction} from "../../../../model/project.model";
import {ProjectService} from "../../../../service/project/project.service";
import {ActivatedRoute} from "@angular/router";
import {ProjectState} from "../../../../store/project.state";
import {Store} from "@ngxs/store";
import { load, LoadOptions } from 'js-yaml'
import {PluginService} from "../../../../service/plugin.service";

export class FormItem {
    name: string;
    type: string;
    objectType?: string;
    keyMapType?: string;
    keyMapPattern?: string;
    enum?: string[];
    formOrder: number;
    condition: FlatElementTypeCondition[];
    description: string;
    pattern: string;
    onchange: string;
    mode: string;
    prefix: string;
}
@Component({
    selector: 'app-json-form-field',
    templateUrl: './json-form-field.html',
    styleUrls: ['./json-form-field.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class JSONFormFieldComponent implements OnChanges {
    @Input() field: FormItem;
    @Input() jsonFormSchema: JSONFormSchema;
    @Input() model: any;
    @Input() parentType: string;
    @Input() disabled: boolean;
    @Input() hideLabel: boolean;
    @Input() entityType: string
    @Output() modelChange = new EventEmitter();

    required: boolean;
    oneOf: Map<string, JSONFormSchemaOneOfItem>;
    oneOfSelected: string[] = new Array<string>();
    oneOfSelectOpts: string[];


    currentModel: any;
    isConditionnal: boolean;
    selectedCondition: FlatElementTypeCondition;
    conditionRefProperties: string[];

    constructor(
        private _cd: ChangeDetectorRef,
        private _projectService: ProjectService,
        private _pluginService: PluginService,
        private _store: Store,
        private _activatedRouter: ActivatedRoute
    ) { }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.jsonFormSchema || !this.field || !this.model) {
            return;
        }
        this.currentModel = Object.assign({}, this.model);
        if (!this.currentModel[this.field.name]) {
            this.currentModel[this.field.name] = null;
        }

        if (this.jsonFormSchema.types[this.parentType].required) {
            this.required = (<string[]>this.jsonFormSchema.types[this.parentType].required)?.indexOf(this.field.name) !== -1;
        } else {
            this.required = false;
        }

        // Init oneOf data to display select
        if (this.field.objectType && this.jsonFormSchema.types[this.field.objectType]?.oneOf?.size > 0) {
            this.oneOf = this.jsonFormSchema.types[this.field.objectType].oneOf;
            this.oneOfSelectOpts = Array.from(this.oneOf.keys());
            if (this.oneOfSelected.length === 0 && this.currentModel[this.field.name]) {
                this.currentModel[this.field.name].forEach((v, i) => {
                    this.oneOfSelectOpts.forEach(opt => {
                        if (v[opt]) {
                            this.oneOfSelected[i] = opt;
                        }
                    })
                });
            }
        }

        this.isConditionnal = this.field.condition && this.field.condition.length > 0;
        this.selectedCondition = (this.field.condition ?? []).find(c => this.currentModel[c.refProperty] && this.currentModel[c.refProperty] === c.conditionValue);
        this.conditionRefProperties = (this.field.condition ?? []).map(c => c.refProperty).filter((ref, index, arr) => arr.indexOf(ref) === index);
        this._cd.markForCheck();
    }

    trackByIndex(index: number) {
        return index;
    }

    updateItemStruct(index: number) {
        this.currentModel[this.field.name][index]['oneOfSelected'] = this.oneOfSelected[index];
        this._cd.markForCheck();
        this.modelChange.emit(this.currentModel);
    }

    addArrayItem() {
        if (!this.currentModel[this.field.name]) {
            this.currentModel[this.field.name] = [];
        }
        this.currentModel[this.field.name].push({})
        this.oneOfSelected.push(this.oneOfSelectOpts[0]);
        this._cd.markForCheck();
    }

    addMapItem() {
        if (!this.currentModel[this.field.name]) {
            this.currentModel[this.field.name] = {}
        }
        if (this.field.objectType === 'string') {
            this.currentModel[this.field.name][''] = '';
        } else {
            this.currentModel[this.field.name][''] = {};
        }
        this._cd.markForCheck();
    }

    onKeyMapChanged(value: any, previousValue): void {
        this.currentModel[this.field.name][value] = this.currentModel[this.field.name][previousValue];
        delete this.currentModel[this.field.name][previousValue];

        this._cd.markForCheck();
        this.modelChange.emit(this.currentModel);
    }

    onValueChanged(value: any, index?: any): void {
        switch (this.field.onchange) {
            case 'loadentity':
                let branch: string;
                let branchSplit = value.split('@');
                if (branchSplit.length === 2) {
                    branch = branchSplit[1];
                }

                if (this.field.prefix) {
                    branchSplit[0] = branchSplit[0].slice(this.field.prefix.length);
                }
                let routeParams = this._activatedRouter.snapshot.params;
                let entitySplit = branchSplit[0].split('/');
                let entityName = '';
                let repoName = '';
                let vcsName = '';
                let projKey = '';
                switch (entitySplit.length) {
                    case 1:
                        entityName = entitySplit[0];
                        repoName = routeParams['repoName'];
                        vcsName = routeParams['vcsName'];
                        projKey = this._store.selectSnapshot(ProjectState.projectSnapshot).key;
                        break;
                    case 3:
                        entityName = entitySplit[2];
                        repoName = entitySplit[0] + '/' + entitySplit[1];
                        vcsName = routeParams['vcsName'];
                        projKey = this._store.selectSnapshot(ProjectState.projectSnapshot).key;
                        break;
                    case 4:
                        entityName = entitySplit[3];
                        repoName = entitySplit[1] + '/' + entitySplit[2];
                        vcsName = entitySplit[0];
                        projKey = this._store.selectSnapshot(ProjectState.projectSnapshot).key;
                        break;
                    case 5:
                        entityName = entitySplit[4];
                        repoName = entitySplit[2] + '/' + entitySplit[3];
                        vcsName = entitySplit[1];
                        projKey = entitySplit[0];
                        break;
                    default:
                        console.error("Unable to load ", entitySplit);
                        return;
                }

                if (this.entityType === EntityAction && entitySplit.length === 1) {
                    this._pluginService.getPlugin(entityName).subscribe(pl => {
                        if (pl.inputs) {
                            let keys =  Object.keys(pl.inputs);
                            if(keys.length > 0) {
                                this.currentModel['with'] = {};
                                keys.forEach(k => {
                                    this.currentModel['with'][k] = pl.inputs[k].default;
                                });
                            }
                            this.modelChange.emit(this.currentModel);
                        }
                    });
                } else {
                    this._projectService.getRepoEntity(projKey, vcsName, repoName, this.entityType, entityName, branch).subscribe(e => {
                        let ent = load(e.data && e.data !== '' ? e.data : '{}', <LoadOptions>{ onWarning: (e) => { } });
                        switch (this.entityType) {
                            case EntityAction:
                                if (ent.inputs) {
                                    let keys =  Object.keys(ent.inputs);
                                    if(keys.length > 0) {
                                        this.currentModel['with'] = {};
                                        keys.forEach(k => {
                                            this.currentModel['with'][k] = ent.inputs[k].default;
                                        });
                                    }
                                }
                                break;
                        }
                        this.modelChange.emit(this.currentModel);
                    });
                }

                break;
        }
        if (this.field.type === 'array' || this.field.type === 'map') {
            this.currentModel[this.field.name][index] = value;
        } else {
            this.currentModel[this.field.name] = value;
        }
        this._cd.markForCheck();
        this.modelChange.emit(this.currentModel);
    }
}
