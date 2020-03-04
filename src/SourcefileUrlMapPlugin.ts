import * as Path from 'path'
import * as FS from 'fs-extra'
import {Component} from 'typedoc/dist/lib/utils/component'
import {ConverterComponent} from 'typedoc/dist/lib/converter/components'
import {Converter} from 'typedoc/dist/lib/converter/converter'
import {Context} from 'typedoc/dist/lib/converter/context'
import {SourceReference} from 'typedoc/dist/lib/models/sources/file'
import {Options} from 'typedoc/dist/lib/utils/options/options'

interface Mapping {
    pattern: RegExp,
    replace: string
}

@Component({name: 'sourcefile-url'})
export class SourcefileUrlMapPlugin extends ConverterComponent {

    private mappings: Mapping[] | undefined

    public initialize(): void
    {
        this.listenTo(this.owner, Converter.EVENT_BEGIN, this.onBegin)
    }

    private onBegin(): void
    {
        // read options parameter
        const options: Options = this.application.options
        const mapRelativePath = options.getValue('sourcefile-url-map')
        const urlPrefix = options.getValue('sourcefile-url-prefix')

    		const isMapRelativePath = typeof mapRelativePath === 'string' && mapRelativePath
    		const isUrlPrefix = typeof urlPrefix === 'string' && urlPrefix

        if ( !isMapRelativePath && !isUrlPrefix ) {
            return
        }

        try {
            if ( isMapRelativePath && isUrlPrefix ) {
                throw new Error('use either --sourcefile-url-prefix or --sourcefile-url-map option')
            }

            if ( isMapRelativePath ) {
                this.readMappingJson(mapRelativePath)
            }
            else if ( isUrlPrefix ) {
                this.mappings = [{
                    pattern: new RegExp('^'),
                    replace: urlPrefix
                }]
            }

            // register handler
            this.listenTo(this.owner, Converter.EVENT_RESOLVE_END, this.onEndResolve)
        }
        catch ( e ) {
            console.error('typedoc-plugin-sourcefile-url: ' + e.message)
        }
    }

    private readMappingJson(mapRelativePath: string): void
    {
        // load json
        const mapAbsolutePath = Path.join(process.cwd(), mapRelativePath)

        let json: any
        try {
            json = JSON.parse(FS.readFileSync(mapAbsolutePath, 'utf8'))
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
