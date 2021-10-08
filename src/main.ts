import {Application, ParameterType, Converter, Context} from 'typedoc';
import { SourcefileUrlMapPlugin } from './SourcefileUrlMapPlugin';

export function load(app: Application) {
    new SourcefileUrlMapPlugin().initialize(app);
}
