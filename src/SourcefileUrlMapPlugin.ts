import * as path from 'path'
import * as fs from 'fs'
import {
    Application,
    Converter,
    Context,
    ParameterType,
    SourceReference
} from 'typedoc';

interface Mapping {
    pattern: RegExp,
    replace: string
}

export class SourcefileUrlMapPlugin {
    private mappings: Mapping[] | undefined

    public initialize(app: Readonly<Application>): void {
        app.options.addDeclaration({
            name: "sourcefile-url-map",
            help: "Will create URLs by prefixing the given parameter in front of each source file",
            type: ParameterType.String
        });

        app.options.addDeclaration({
            name: "sourcefile-url-prefix",
            help: "Allows for advanced mappings as described in a JSON file",
            type: ParameterType.String
        });
        this.subscribeToApplicationEvents(app);
    }

    private subscribeToApplicationEvents(app: Readonly<Application>): void {
        app.converter.on(Converter.EVENT_BEGIN, () => this.onBegin(app));
        app.converter.on(Converter.EVENT_RESOLVE_END, (context: Context) => this.onEndResolve(context));
    }

    private onBegin(app: Readonly<Application>): void
    {
        // read options parameters
        const mapRelativePath = this.readStringOption(app, 'sourcefile-url-map')
        const urlPrefix = this.readStringOption(app, 'sourcefile-url-prefix')

        if ( !mapRelativePath && !urlPrefix ) {
            return
        }

        try {
            if ( mapRelativePath && urlPrefix ) {
                throw new Error('use either --sourcefile-url-prefix or --sourcefile-url-map option')
            }

            if ( mapRelativePath ) {
                this.readMappingJson(mapRelativePath)
            }
            else if ( urlPrefix ) {
                this.mappings = [{
                    pattern: new RegExp('^'),
                    replace: urlPrefix
                }]
            }
        }
        catch ( e ) {
            console.error('typedoc-plugin-sourcefile-url: ' + e.message)
        }
    }

    private readStringOption(app: Readonly<Application>, name: string): string | undefined {
        const value = app.options.getValue(name)

        if (typeof value !== "string") {
            return undefined
        }

        return value
    }

    private readMappingJson(mapRelativePath: string): void
    {
        // load json
        const mapAbsolutePath = path.join(process.cwd(), mapRelativePath)

        let json: any
        try {
            json = JSON.parse(fs.readFileSync(mapAbsolutePath, 'utf8'))
        }
        catch ( e ) {
            throw new Error('error reading --sourcefile-url-map json file: ' + e.message)
        }

        // validate json
        if ( !(json instanceof Array) ) {
            throw new Error('--sourcefile-url-map json file has to have Array as root element')
        }

        this.mappings = []

        // validate & process json
        for ( const mappingJson of json ) {
            if ( mappingJson instanceof Object && mappingJson.hasOwnProperty('pattern') && mappingJson.hasOwnProperty('replace') && typeof mappingJson['pattern'] === 'string' && typeof mappingJson['replace'] === 'string' ) {
                let regExp: RegExp | null = null

                try {
                    regExp = new RegExp(mappingJson['pattern'])
                }
                catch ( e ) {
                    throw new Error('error reading --sourcefile-url-map: ' + e.message)
                }

                this.mappings.push({
                    pattern: regExp as RegExp,
                    replace: mappingJson['replace']
                })
            }
            else {
                throw new Error('--sourcefile-url-map json file syntax has to be: [{"pattern": "REGEX PATTERN STRING WITHOUT ENCLOSING SLASHES", replace: "STRING"}, ETC.]')
            }
        }
    }

    private onEndResolve(context: Context): void
    {
        if ( this.mappings === undefined ) {
            throw new Error('assertion fail')
        }

        const project = context.project

        // process mappings
        for ( const sourceFile of project.files ) {
            for ( const mapping of this.mappings ) {
                if ( sourceFile.fileName.match(mapping.pattern) ) {
                    sourceFile.url = sourceFile.fileName.replace(mapping.pattern, mapping.replace)
                    break
                }
            }
        }

        // add line anchors
        for ( let key in project.reflections ) {
            const reflection = project.reflections[key]

            if ( reflection.sources ) {
                reflection.sources.forEach((source: SourceReference) => {
                    if (source.file && source.file.url) {
                        source.url = source.file.url + '#L' + source.line
                    }
                })
            }
        }
    }

}
