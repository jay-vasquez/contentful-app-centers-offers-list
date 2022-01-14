import React, { useState, useEffect } from 'react';
import { Environment, PlainClientAPI, QueryOptions } from 'contentful-management';
import { Entry } from 'contentful-management/types';
import { EntityStatus } from "@contentful/f36-core";
import { EntryCard, Heading, Flex, Paragraph } from '@contentful/f36-components';
import { EditorExtensionSDK } from '@contentful/app-sdk';
import { createClient } from 'contentful-management';

interface EditorProps {
  sdk: EditorExtensionSDK;
  cma: PlainClientAPI;
}

// Entry details base model
interface EntryDetails {
  "id": string,
  "contentType": string;
  "status": EntityStatus;
  "title": string;
  "description": string;
}

// Offer model
interface Offer extends EntryDetails {

}

// Business model
interface Business extends EntryDetails {
  "offers": Offer[]
}

// Check status of entry; returns 'EntityStatus' type
const checkEntryStatus = (entry: Entry): EntityStatus => {
    if (entry.isArchived()) {
      return 'archived';
    } else if (entry.isPublished()) {
      return 'published';
    } else if (entry.isUpdated()) {
      return 'changed';
    } else if (entry.isDraft()) {
      return 'draft';
    }
    return 'new';
};

// Fetch entries more than Contentful's limit; returns array of Contentful Entries
const getContentfulPaginatedEntries = async (environment: Environment, query: QueryOptions, data: Entry[] = []) => {
  let results = data;
  if (query.skip === undefined) {
    query.skip = 0;
  }

  let entries = await environment.getEntries(query);
  results.push(...entries.items);

  if (entries.limit < entries.total) {
    query.skip += 1000;
    await getContentfulPaginatedEntries(environment, query, results)
  }

  return results;
}

const EntryEditor = (props: EditorProps) => {
  const [business, setBusinesses] = useState<Array<Business>>([]);
  const [offerCount, setOfferCount] = useState(0);
  useEffect(() => {
    (async () => {
      let data: Business[] = [];
      let offersCount = 0;

      // Create Contentful client from sdk's Contentful management api adapter
      let cma = createClient (
        {apiAdapter: props.sdk.cmaAdapter}
      );
      
      // Get current Center opened 
      let currentCenter = props.sdk.entry.getSys();
      
      // Query used for businesess (store and restaurant) linked with the current center
      let queryBusiness = {
        content_type: "",
        include: 1,
        limit: 1000,
        'fields.center.sys.id': currentCenter.id,
      }

      // Query used for all offers
      let queryOffers = {
        content_type: "offer",
        include: 1,
        limit: 1000,
        skip: 0,
      }

      // Fetch current space and environment from Contentful's management api
      let currentSpace = await cma.getSpace(props.sdk.ids.space);
      let currentEnvironment = await currentSpace.getEnvironment(props.sdk.ids.environment);
      
      // Query all stores linked with the current center
      queryBusiness.content_type = "store";
      let centerStores = await currentEnvironment.getEntries(queryBusiness).then(businesses => { return businesses.items });

      // Query all restaurants with the current center
      queryBusiness.content_type = "restaurant";
      let centerRestaurants = await currentEnvironment.getEntries(queryBusiness).then(businesses => { return businesses.items });

      // Query all offers and group stores and restaurants to one array
      let allOffers = await getContentfulPaginatedEntries(currentEnvironment, queryOffers);
      let centerBusinesses = [...centerStores, ...centerRestaurants];

      if (centerBusinesses) {
        centerBusinesses.map(async business => {
          // Map current business to Business model
          let currentBusiness: Business = {
            "id": business.sys.id,
            "contentType": business.sys.contentType.sys.id,
            "status": checkEntryStatus(business),
            "title": business.fields.displayName['en-US'],
            "description": business.fields.shortDescription['en-US'],
            "offers": [],
          };

          // Filter offers linked to the current business
          let businessOffers = allOffers.filter(offer => {
            if (offer.fields.business) {
              return offer.fields.business['en-US'].sys.id == business.sys.id;
            } else {
              return false;
            }            
          })

          if (businessOffers.length > 0) {
            // Map business offers to Offer model
            businessOffers.map(offer => {
              let currentOffer: Offer = {
                "id": offer.sys.id,
                "contentType": offer.sys.contentType.sys.id,
                "status": checkEntryStatus(offer),
                "title": offer.fields.title['en-US'],
                "description": offer.fields.summary['en-US'],
              }

              currentBusiness.offers.push(currentOffer);
              offersCount += 1;
            });
          }
          data.push(currentBusiness);
        });
      }
      setOfferCount(offersCount);
      setBusinesses(data);
    })();
  }, []);

  return (
    <>
      <Flex flexDirection="column" alignItems="center">
        <Heading>Center Offers</Heading>
        <Paragraph>This center has {offerCount} offers</Paragraph>
      </Flex>
      <Flex flexDirection="column">
        {
          business.map(business => {
            return (
              <>
              { business.offers.length > 0 &&
                  <EntryCard
                  key={business.id}
                  status={business.status}
                  contentType="Business"
                  title={business.title}
                  description={business.description}
                  marginLeft="spacingS"
                  marginBottom="spacingS"
                  marginRight="spacingS"
                />
              }
              { business.offers.length > 0 &&
                business.offers.map(offer => {
                  return (
                    <>
                    <EntryCard
                      key={offer.id}
                      status="published"
                      contentType="Offer"
                      title={offer.title}
                      description={offer.description}
                      marginLeft="spacing2Xl"
                      marginRight="spacingS"
                      marginBottom="spacingS"
                    />
                    </>
                  );
                })
              }
            </>
            );
            
          })
        }
      </Flex>
    </>
  );
};

export default EntryEditor;
