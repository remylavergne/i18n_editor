export namespace main {
	
	export class DiffChange {
	    type: string;
	    key: string;
	    oldValue: string;
	    newValue: string;
	    line: number;
	
	    static createFrom(source: any = {}) {
	        return new DiffChange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.key = source["key"];
	        this.oldValue = source["oldValue"];
	        this.newValue = source["newValue"];
	        this.line = source["line"];
	    }
	}
	export class DiffChangeContext {
	    description?: string;
	    screenUrl?: string;
	    componentName?: string;
	
	    static createFrom(source: any = {}) {
	        return new DiffChangeContext(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.description = source["description"];
	        this.screenUrl = source["screenUrl"];
	        this.componentName = source["componentName"];
	    }
	}
	export class DiffChangeSource {
	    file?: string;
	    hunk?: string;
	    line: number;
	
	    static createFrom(source: any = {}) {
	        return new DiffChangeSource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file = source["file"];
	        this.hunk = source["hunk"];
	        this.line = source["line"];
	    }
	}
	export class StandardizedDiffChange {
	    action: string;
	    path: string;
	    segments?: string[];
	    key: string;
	    oldValue?: string;
	    newValue?: string;
	    context?: DiffChangeContext;
	    source: DiffChangeSource;
	
	    static createFrom(source: any = {}) {
	        return new StandardizedDiffChange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.action = source["action"];
	        this.path = source["path"];
	        this.segments = source["segments"];
	        this.key = source["key"];
	        this.oldValue = source["oldValue"];
	        this.newValue = source["newValue"];
	        this.context = this.convertValues(source["context"], DiffChangeContext);
	        this.source = this.convertValues(source["source"], DiffChangeSource);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

