import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DisasterData {
    name: string;
    "main contact method (link)": string;
    "work description per event": string;
    type: string;
    "person to contact": string;
    "support method": string;
    "size of group": string;
    reference: string;
    "service sectors": string;
    IDRN: string;
    "Correspondents direct conx": string;
}

@Injectable({
  providedIn: 'root'
})
export class DisasterDataService {
  private apiUrl = 'http://localhost:3000/disaster-data';

  constructor(private http: HttpClient) { }

  getDisasterData(): Observable<DisasterData[]> {
    return this.http.get<DisasterData[]>(this.apiUrl);
  }
}
