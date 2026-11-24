use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Region {
    // all in 0..1, relative to the image
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub operation_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub technique_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub region: Option<Region>,
    pub suggested: bool,
}

/// A reference with no tags is in the Inbox (derived, never stored).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Reference {
    pub id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creator: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credit: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub file: String,
    pub hash: String,
    pub width: u32,
    pub height: u32,
    /// ISO-8601
    pub added_at: String,
    pub tags: Vec<Tag>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub id: String,
    pub from_ref: String,
    pub to_ref: String,
    pub why: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub name: String,
    pub reference_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryData {
    pub version: u32,
    pub references: Vec<Reference>,
    pub links: Vec<Link>,
    pub boards: Vec<Board>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_is_camel_case_and_skips_none() {
        let t = Tag {
            id: "t1".into(),
            operation_id: "op".into(),
            technique_id: None,
            branch_id: Some("br".into()),
            region: None,
            suggested: false,
        };
        let v = serde_json::to_value(&t).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"id": "t1", "operationId": "op", "branchId": "br", "suggested": false})
        );
        assert_eq!(serde_json::from_value::<Tag>(v).unwrap(), t);
    }
}
