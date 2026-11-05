import {annualReportsHandler} from '../lib/annual-documents';
export default {fetch(request:Request,env:any){return annualReportsHandler(request,env)}};
