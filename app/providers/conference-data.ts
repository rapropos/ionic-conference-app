import {Injectable} from '@angular/core';
import {Observable, ReplaySubject} from 'rxjs/Rx';
import {Http} from '@angular/http';
import {UserData} from './user-data';

// This can be done anywhere in the application, but each Rx operator
// must be explicitly imported once.
import "rxjs/add/operator/map";

export interface ConferenceSpeaker {
  name: string;
  profilePic: string;
  twitter: string;
  about: string;
  sessions: ConferenceSession[];
}

export interface ConferenceSession {
  name: string;
  location: string;
  description?: string;
  timeStart: string;
  timeEnd: string;
  tracks: string[];
  speakerNames?: string[];
  speakers?: ConferenceSpeaker[];
  hide?: boolean;
}

export interface ConferenceScheduleBlock {
  time: string;
  sessions: ConferenceSession[];
  hide?: boolean;
}

export interface ConferenceScheduleDay {
  date: string;
  groups: ConferenceScheduleBlock[];
  shownSessions?: number;
}

// TODO: I would like to extend google.maps.LatLngLiteral here, but
// it is defined as a closed type, not an interface, so this is impossible
export interface ConferenceLocation {
  name: string;
  lat: string;
  lng: string;
  center?: boolean;
}

export interface FullConferenceData {
  schedule: ConferenceScheduleDay[];
  speakers: ConferenceSpeaker[];
  map: ConferenceLocation[];
  tracks?: string[];
}

@Injectable()
export class ConferenceData {
  // This member is private for two main reasons:
  // - prevents modification from outside
  // - allows it to be exposed as a supertype
  //
  // Using a ReplaySubject here with a stack depth of 1 ensures that
  // only the freshest data is always available to clients
  private cache: ReplaySubject<FullConferenceData> = new ReplaySubject<FullConferenceData>(1);

  constructor(private http: Http, private user: UserData) {
    // We assume that the data should always be fetched once as soon as
    // this object is instantiated. In real-world client-server applications,
    // you could choose to prime from a locally stored cache here instead.
    this.refresh();
  }

  // This method can be called as many times as desired, and will
  // automatically update all exposed assets. This would be
  // meaningful in a client-server situation where the server could
  // be constantly having updated data. In this example, since the
  // data never changes, calling it repeatedly won't have any
  // practical effect.

  refresh():void {
    // We're using Angular Http provider to request the data
    this.http.get('data/data.json')
      // Parse the Http Response object as JSON
      .map(res => {
        // While it's not really needed to assign this to a local variable,
        // and the result of calling res.json() could be returned directly,
        // this extra statement allows you to easily set a breakpoint in
        // your code to see if things are proceeding through the pipeline
        // as expected.
        let flatdata = res.json();
        return flatdata;
      })
      // Now we reanimate the flat data that is received from the server
      // into an object graph that can be consumed more easily in our app.
      .map(data => {
        this.processData(data);
        return data;
      })
      // Subscribing our instance subject here causes it to be updated with
      // the processed new data
      .subscribe(this.cache, err => {
        // There are a number of ways to report errors back
        console.log(err);
      });
  }

  private processData(data:FullConferenceData): void {
    // just some good 'ol JS fun with objects and arrays
    // build up the data by linking speakers to sessions

    data.tracks = [];

    // loop through each day in the schedule
    data.schedule.forEach(day => {
      // loop through each timeline group in the day
      day.groups.forEach(group => {
        // loop through each session in the timeline group
        group.sessions.forEach(session => {
          this.processSession(data, session);
        });
      });
    });

    // alphabetize speakers
    data.speakers.sort((a, b) => {
      let aName = a.name.split(' ').pop();
      let bName = b.name.split(' ').pop();
      return aName.localeCompare(bName);
    });

    // sort tracks
    data.tracks.sort();
  }

  private processSession(data:FullConferenceData, session:ConferenceSession):void {
    // loop through each speaker and load the speaker data
    // using the speaker name as the key
    session.speakers = [];
    if (session.speakerNames) {
      session.speakerNames.forEach(speakerName => {
        let speaker = data.speakers.find(s => s.name === speakerName);
        if (speaker) {
          session.speakers.push(speaker);
          speaker.sessions = speaker.sessions || [];
          speaker.sessions.push(session);
        }
      });
    }

    if (session.tracks) {
      session.tracks.forEach(track => {
        if (data.tracks.indexOf(track) < 0) {
          data.tracks.push(track);
        }
      });
    }
  }

  getTimeline(dayIndex:number, queryText:string = '',
              excludeTracks:string[] = [], segment:string = 'all'):Observable<ConferenceScheduleDay> {
    return this.cache.map(data => {
      let day = data.schedule[dayIndex];
      day.shownSessions = 0;

      queryText = queryText.toLowerCase().replace(/,|\.|-/g, ' ');
      let queryWords = queryText.split(' ').filter(w => !!w.trim().length);

      day.groups.forEach(group => {
        group.hide = true;

        group.sessions.forEach(session => {
          // check if this session should show or not
          this.filterSession(session, queryWords, excludeTracks, segment);

          if (!session.hide) {
            // if this session is not hidden then this group should show
            group.hide = false;
            day.shownSessions++;
          }
        });

      });

      return day;
    });
  }

  filterSession(session:ConferenceSession, queryWords:string[] = [],
                excludeTracks:string[] = [], segment:string = 'all'):void {
    let matchesQueryText = false;
    if (queryWords.length) {
      // of any query word is in the session name than it passes the query test
      queryWords.forEach(queryWord => {
        if (session.name.toLowerCase().indexOf(queryWord) > -1) {
          matchesQueryText = true;
        }
      });
    } else {
      // if there are no query words then this session passes the query test
      matchesQueryText = true;
    }

    // if any of the sessions tracks are not in the
    // exclude tracks then this session passes the track test
    let matchesTracks = false;
    session.tracks.forEach(trackName => {
      if (excludeTracks.indexOf(trackName) === -1) {
        matchesTracks = true;
      }
    });

    // if the segement is 'favorites', but session is not a user favorite
    // then this session does not pass the segment test
    let matchesSegment = false;
    if (segment === 'favorites') {
      if (this.user.hasFavorite(session.name)) {
        matchesSegment = true;
      }
    } else {
      matchesSegment = true;
    }

    // all tests must be true if it should not be hidden
    session.hide = !(matchesQueryText && matchesTracks && matchesSegment);
  }

  getSpeakers():Observable<ConferenceSpeaker[]> {
    return this.cache.map(data => {
      return data.speakers;
    });
  }

  getTracks():Observable<string[]> {
    return this.cache.map(data => {
      return data.tracks;
    });
  }

  getMap():Observable<ConferenceLocation[]> {
    return this.cache.map(data => {
      return data.map;
    });
  }
}
