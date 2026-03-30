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

}

